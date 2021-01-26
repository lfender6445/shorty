#!/bin/sh

mongo skitlydb \
      --eval "db.dropDatabase()"