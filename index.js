const Koa = require("koa");
const url = require("url");
const bodyParser = require("koa-bodyparser");
const urlRegexSafe = require("url-regex-safe");

const app = new Koa();
const fs = require("fs");
const {
  batchWriteShortUrls,
  writeSubmission,
  readSubmissions,
  readByShortId,
} = require("./db");

const { nanoid } = require("nanoid");

const SHORT_URL_LIMIT = 5;
const PROD_URL = "https://skl.sh/";
const SHORT_URL_HOST =
  process.env.NODE_ENV === "production"
    ? "https://skl.sh/"
    : "http://localhost:3000/proxy/";

const PERM_REDIRECT = 301;

const homeHtml = fs.readFileSync("./homePage.html", "utf8");
const commentHtml = fs.readFileSync("./comment-partial.html", "utf8");

const makeCommentPartial = (submission) => {
  return commentHtml.replace(
    "<!--comment-partial-placeholder-->",
    submission.content
  );
};

const routes = {
  "/": async () => {
    const submissions = await readSubmissions();
    const processed = submissions.map(makeCommentPartial).join("");
    return homeHtml.replace("<!--comments-partial-placeholder-->", processed);
  },
  404: '<p>Page Not Found | <a title="home" href="/">Click here to return home</a></p>',
  "/submit": "<h1>processing submission.../h1>",
};

const INSECURE = "http:";
const SECURE = "https:";

const SUPPORTED_PROCOTOLS = [
  // INSECURE,
  SECURE,
];

const urlSafeOpts = {
  localhost: process.NODE_ENV !== "production",
};

// TODO: setup indexation on shortId for faster lookups
const makeUrlRecord = (before, after) => {
  // TODO: guard duplicate short urls from being submitted (unlikely but possible)
  // TODO: handle time stamp and consider user associations
  return { shortId: nanoid(SHORT_URL_LIMIT), before, after };
};

// TODO: could crawl destination url at later time and get meta info like page title
// chose to display page title to build trust
const makeAnchor = (absoluteShortIdUrl, title = "") => {
  return `<a href="${absoluteShortIdUrl}" taget="_blank" title=${title}>${
    title || absoluteShortIdUrl
  }</a>`;
};

const makeShortUrl = (shortId) => {
  return `${SHORT_URL_HOST}${shortId}`;
};

const handleFormSubmit = async (ctx) => {
  const body = ctx && ctx.request ? ctx.request.body : undefined;

  let submissionTxt = body.content;

  if (body && submissionTxt) {
    let matches = submissionTxt.match(urlRegexSafe(urlSafeOpts)) || [];
    matches = matches.reduce((accum, current) => {
      let parsed = url.parse(current);

      if (parsed.protocol) {
        const isSupportedProtocol = SUPPORTED_PROCOTOLS.includes(
          parsed.protocol
        );

        if (!isSupportedProtocol) {
          if (parsed.protocol === INSECURE) {
            const updated = current.replace("http://", "https://");
            // this is the model for urls
            const record = makeUrlRecord(current, updated);

            submissionTxt = submissionTxt.replace(
              record.before,
              makeAnchor(makeShortUrl(record.shortId))
            );
            accum.push(record);
          } else {
            console.warn(
              "ignoring unsupported protocol",
              parsed.protocol,
              current
            );
          }
        } else {
          const record = makeUrlRecord(current, current);
          accum.push(record);
          submissionTxt = submissionTxt.replace(
            record.before,
            makeAnchor(makeShortUrl(record.shortId))
          );
        }
      } else {
        const record = makeUrlRecord(current, `${SECURE}//${current}`);
        accum.push(record);
        submissionTxt = submissionTxt.replace(
          record.before,
          makeAnchor(makeShortUrl(record.shortId))
        );
      }
      return accum;
    }, []);

    let promises = [];

    if (matches.length) {
      promises.push(batchWriteShortUrls(matches));
    }

    if (submissionTxt) promises.push(writeSubmission(submissionTxt));

    await Promise.all(promises);
  }
};

const frontEndService = async (ctx) => {
  ctx.status = 404;

  switch (ctx.accepts("html", "json")) {
    case "html":
      ctx.type = "html";
      const r = routes[ctx.path];
      if (typeof r === "function") {
        ctx.body = await r();
      } else {
        ctx.body = r;
      }
      if (!ctx.body) {
        ctx.body = routes["404"];
      } else {
        ctx.status = 200;
      }
      break;
    case "json":
      // TODO: support json layer for client consumption
      ctx.status = 404;
      ctx.body = {
        message: "Page Not Found",
      };
      break;
    default:
      ctx.status = 404;
      ctx.type = "text";
      ctx.body = "Page Not Found";
  }
};

const submissionSvc = async (ctx, next) => {
  const isFormSubmission = ctx.method === "POST" && ctx.path === "/submit";
  if (isFormSubmission) {
    await handleFormSubmit(ctx);
    // TODO: show success message on completion
    if (process.NODE_ENV === "production") ctx.status = PERM_REDIRECT;

    // NOTE: koa does 302 redirectes by default
    // i am retaining that in dev mode to avoid browser caching redirects
    // but i realize this might not be a desriable assumption for other devs
    return ctx.redirect("/?submitted=true");
  } else {
    await next();
  }
};

const getShortSlugFromPath = (path) => {
  const parts = path.split("/");
  const shortId = parts[parts.length - 1];
  return shortId || "";
};

const proxySvc = async (ctx, next) => {
  let shortId;
  if (process.NODE_ENV === "production" && ctx.request.origin === PROD_URL) {
    shortId = getShortSlugFromPath(ctx.path);
  } else {
    const pathMatch = ctx.path.match("/proxy/") || [];
    const hasShortUrlInPath = Boolean(ctx.method === "GET" && pathMatch.length);
    if (hasShortUrlInPath) {
      shortId = getShortSlugFromPath(ctx.path);
    }
  }

  if (shortId) {
    const record = (await readByShortId(shortId))[0];

    if (record) {
      const destination = record.after;
      return ctx.redirect(destination);
    }
    // TODO: handle error cases
  }

  await next();
};

app.use(bodyParser());

// analytics - process referrals and headers for meta info, fwd to ext realm
// would expect this to always come before proxySvc or be baked into it
// app.use(analyticsSvc);

app.use(proxySvc);

// sanitize for html + malicious actors + script inject + phishing
// app.use(sanitizerSvc)

app.use(submissionSvc);

// app.use(crawlerSvc) - get title tag of destination so you can display meta info about the destination
app.use(frontEndService);

console.info("listening on 3000");
app.listen(3000);
