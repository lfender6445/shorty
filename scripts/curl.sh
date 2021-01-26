# /bin/sh

# curl -I 'http://localhost:3000/submit' -X POST  -H "Content-Type: text/plain" --data "this is raw data"

curl -d 'content=hello world google.com google.com o.co http://google.com gmail.com.com gmail.com' -X POST http://localhost:3000/submit -H 'Content-Type: application/x-www-form-urlencoded'