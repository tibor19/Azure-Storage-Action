const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const core = require('@actions/core');
const { BlobServiceClient } = require('@azure/storage-blob');

const readdir = promisify(fs.readdir);

const listFiles = async function* (dir){
    const files = await readdir(dir);
    for (const file of files){
        const fileName = Path.join(dir, file);
        if(fs.statSync(fileName).isDirectory()){
            yield *listFiles(fileName);
        }else{
            yield fileName;
        }
    }
}

const main = async () => {
    const connectionString = core.getInput('connection-string');
    const folder = core.getInput('folder');
    const accessPolicy = core.getInput('public-access-policy');
    const enableStaticWebSite = core.getInput('enabled-static-website');
    const removeExistingFiles = core.getInput('remove-existing-files');

    var containerName = core.getInput('blob-container-name');
    var indexFile;
    var errorFile;

    if (!connectionString) {
        core.setFailed("Connection string must be specified!");
        throw "";
    }

    if (enableStaticWebSite) {
        containerName = '$web';
        indexFile = core.getInput('index-file') || 'index.html';
        errorFile = core.getInput('error-file') || 'index.html';
    }

    if (!containerName) {
        core.setFailed("Connection string must be specified!");
        throw "";
    }

    const blobServiceClient = await BlobServiceClient.fromConnectionString(connectionString);

    if (enableStaticWebSite) {

        var props = await blobServiceClient.getProperties();
        props.cors = props.cors || [];
        props.staticWebsite.enabled = true;
        props.staticWebsite.indexDocument = indexFile;
        props.staticWebsite.errorDocument404Path = errorFile;
        await blobServiceClient.setProperties(props);
    }

    const containerService = blobServiceClient.getContainerClient(containerName);
    if (!await containerService.exists()) {
        await containerService.create({ access: accessPolicy });
    }
    else {
        await containerService.setAccessPolicy(accessPolicy);
    }

    if(removeExistingFiles){
        for await (const blob of containerService.listBlobsFlat()){
            containerService.deleteBlob(blob.name);
        }
    }

    const rootFolder = path.resolve(folder);

    for await (const file of listFiles(rootFolder)) {
        var blobName = Path.relative(rootFolder, file);
        var blobClient = containerService.getBlockBlobClient(blobName);
        await blobClient.uploadFile(file);
        console.log(Path.relative(rootFolder, file));
    }

};

main().catch(err => {
    console.error(err);
    console.error(err.stack);
    process.exit(-1);
})