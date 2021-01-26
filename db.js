const { MongoClient } = require("mongodb");
const isProd = process.env.NODE_ENV === "production";

const DB_NAME = "skitlydb";
const SUBMISSION_COLLECTION = "submissions";
const SHORT_URL_COLLECTION = "shortUrls";

// TODO: investigate prod setup
// const uri =
//       "mongodb+srv://<user>:<password>@<cluster-url>?retryWrites=true&w=majority";

const uri = `mongodb://${isProd ? "mongo" : "localhost"}:27017/${DB_NAME}`;

const mongo = new MongoClient.connect(uri, { useUnifiedTopology: true });

// TODO: cache connection
const connect = async () => {
  let client = await mongo;
  const db = client.db(DB_NAME);
  return db;
};

const writeSubmission = async (processedComment) => {
  const collection = (await connect()).collection(SUBMISSION_COLLECTION);

  await collection.insertOne({ content: processedComment });
};

const readSubmissions = async () => {
  const collection = (await connect()).collection(SUBMISSION_COLLECTION);

  // NOTE: show last 3 by most recent
  const data = await collection.find().sort({ _id: -1 }).limit(3);

  return data.toArray();
};

const readByShortId = async (shortId) => {
  const collection = (await connect()).collection(SHORT_URL_COLLECTION);

  const record = await collection.find({ shortId });

  // TODO: prob do not need to call toArray()
  // since we are fetching single rec
  return record.toArray();
};

const batchWriteShortUrls = async (records) => {
  const collection = (await connect()).collection(SHORT_URL_COLLECTION);

  await collection.insertMany(records);
};

module.exports = {
  writeSubmission,
  batchWriteShortUrls,
  readSubmissions,
  readByShortId,
};
