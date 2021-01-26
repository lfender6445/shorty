#!/bin/sh

mongoimport -d skitlydb \
            -c submissions \
            --type csv --headerline \
            --file ./scripts/seed.csv