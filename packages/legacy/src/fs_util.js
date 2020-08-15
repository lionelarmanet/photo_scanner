const fs = require("fs");
const { Readable, Transform, pipeline } = require("stream");

async function* recursiveScan(path) {
    const dir = await fs.promises.opendir(path);
    for await (const dirent of dir) {
        const currentPath = `${path}/${dirent.name}`;
        if (dirent.isFile()) {
            yield currentPath;
        }
        if (dirent.isDirectory()) {
            yield* await recursiveScan(currentPath);
        }
    }
}

const filter = (regex) =>
    new Transform({
        transform(chunk, encoding, callback) {
            const filePath = String(chunk).toLowerCase();
            if (filePath.match(regex)) {
                return callback(null, chunk);
            }
            this.emit("omit", filePath);
            callback();
        }
    });

module.exports = {
    recursiveScan: (rootUrl, fileExtensions) => {
        return pipeline(
            Readable.from(recursiveScan(rootUrl)),
            filter(fileExtensions.join("|")),
            (err) => {}
        );
    }
};
