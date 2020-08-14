const readline = require('readline');
const exif = require('jpeg-exif');
const { Readable, Writable, Transform, pipeline } = require('stream');
const { Pool } = require('pg')
const { recursiveScan } = require('./src/fs_util');
const uuid = require('uuid');
const path = require('path');

function spinner(message) {
    var _message = message;

    const spinner = '▁▃▄▅▆▇█▇▆▅▄▃';
    var spinnerPosition = 0;
    const printWithSpinner = (message) => {
        spinnerPosition = (spinnerPosition + 1) % spinner.length;
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(`${spinner.charAt(spinnerPosition)} ${message}`);
    }

    var interval = setInterval(() => {
        printWithSpinner(_message);
    }, 100);
    printWithSpinner(_message);

    return {
        setMessage: message => {
            _message = message;
        },
        stop: () => {
            clearInterval(interval);
            printWithSpinner(_message);
        },
        cleanup: () => {
            readline.cursorTo(process.stdout, 0);    
            process.stdout.write('');
        }
    }
}

async function gatherAllFilenamesFromFS(rootUrl) {
    const stats = {
        removed: 0,
        filtered: 0,
        fileNames: []
    };
    return new Promise((resolve, reject) => {
        recursiveScan(rootUrl, ['.jpg','.png','.jpeg','.gif','.png'])
            .on('omit', () => {
                stats.removed++;
            })
            .on('data', data => {
                stats.filtered++;
                stats.fileNames.push(String(data));
                sp.setMessage(`Recursively scanning ${rootUrl}, ${stats.filtered} / ${stats.filtered + stats.removed}`);
            })
            .on('finish', () => {
                sp.setMessage(`Recursively scanning ${rootUrl}, ${stats.filtered} / ${stats.filtered + stats.removed}`);
                resolve(stats);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
}

class FileNamesStream extends Readable {
    constructor(fileNames) {
        super();
        this.fileNames = fileNames;
        this.index = 0;
    }

    _read() {
        if (this.index < this.fileNames.length) {
            this.push(this.fileNames[this.index]);
        } else {
            this.push(null);
        }
        this.index++;
    }
}

const exifExtractor = rootUrl => new Transform({
    objectMode: true,
    transform(chunk, encoding, callback) {
        const self = this;
        const filePath = String(chunk);
        exif.parse(filePath, (err, data) => {
            if (err) {
                self.emit('failed', filePath);
                return callback();
            }
            callback(null, { 
                filePath: filePath,
                meta: {
                    exif: data,
                    tags: path.dirname(filePath.replace(rootUrl, '')).split('/').filter(x => x.length > 0)
                }
            });
        });
    }
});

const omitIndexed = alreadyIndexed => new Transform({
    transform(chunk, encoding, callback) {
        const filePath = String(chunk);
        if(alreadyIndexed.includes(filePath)) {
            return callback();
        }

        return callback(null, chunk);
    }
});

async function loadIndexedFilenames() {
    const client = await pool.connect();
    try {
        const result = await client.query('select path from photo_scanner.photos');
        return result.rows.map(row => row['path']);
    } finally {
        client.release();
    }
}

async function main(pool, rootUrl) {
    const filesObject = await gatherAllFilenamesFromFS(rootUrl);
    const readableStream = new FileNamesStream(filesObject.fileNames);
    const processedPhotos = pipeline(readableStream, omitIndexed(await(loadIndexedFilenames())), exifExtractor(rootUrl), (err) => {});
    var x = 0;
    for await (const processed of processedPhotos) {
        sp.setMessage(`Processed ${processed.filePath} (${++x}/${filesObject.filtered})`);
        const client = await pool.connect();
        try {
            await client.query(
                'insert into photo_scanner.photos(photos_id, name, path, features) values ($1, $2, $3, $4)',
                [uuid.v4(), path.basename(processed.filePath), processed.filePath, processed.meta]);
        } finally {
            client.release();
        }
    }
}

const pool = new Pool();
pool.on('error', (err, client) => {
    throw new Error(`Unexpected error on idle client, ${err}`);
});

const args = process.argv.slice(2);
if (args.length !== 1) {
    throw new Error("Wrong arguments");
}

const rootUrl = args[0];
const sp = spinner(`Recursively scanning ${rootUrl}`);

main(pool, rootUrl)
    .catch(err => {
        sp.cleanup();
        console.error('err', err);
    }) 
    .finally(stats => {
        sp.stop();
        pool.end();
    });
