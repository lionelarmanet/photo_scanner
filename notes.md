Run app lerna run start -- /Users/larmanet/Desktop/Maison

`docker run --name postgres -v $(pwd)/pg_data:/var/lib/postgresql/data -p 10122:5432 -e POSTGRES_PASSWORD=root -d postgres:latest`

psql -h localhost -U postgres

createuser -P -s -h localhost -U postgres -e app_admin
createuser -P -R -D -h localhost -U postgres -e app_user

psql -h localhost -U app_admin postgres
CREATE DATABASE photo_scanner OWNER app_admin;

psql -h localhost -U app_admin photo_scanner
CREATE SCHEMA IF NOT EXISTS photo_scanner AUTHORIZATION app_admin;
GRANT CONNECT ON DATABASE photo_scanner TO app_user;
GRANT USAGE ON SCHEMA photo_scanner TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA photo_scanner TO app_user;

CREATE TABLE photo_scanner.photos (
photos_id UUID PRIMARY KEY,
name varchar(250) NOT NULL CHECK (name <> ''),
path varchar(1024) NOT NULL CHECK (path <> ''),
features json NOT NULL
);

RUN

select features -> 'tags' from photo_scanner.photos where features -> 'exif' ->> 'Make' = 'HUAWEI';

# New design

TODOs:

-   testing fwk

Flow:

fileindexer.js
--> scans for photos
--> publishes an event
--> acts as a bolt

rateLimiter.js
--> ensure to keep the system under its limits
--> limit should be below the memory_limit_for_redis
--> descision = XGB = n \* thumbsize(50x50)
--> limit = n = XGB / thumbsize(50x50)

cache.js
--> puts the photo in cache
--> compress & resize (50x50)

exifExtractor.js
--> extract exif
--> publishes an event w/ exif info

featureFaceExtractor.js
--> extract & publish information

featureColorExtractor.js
--> extract color & stuff

featureXExtractor.js
--> extract color & stuff

distance.js
--> updates the distance matrix

(out) thumbnailExtractor.js
--> extracts the image thumbnail
--> save it to a given FS

(out) insert.js
--> insert to stateful db

(out) update.js
--> updates the photo with new features (db)
