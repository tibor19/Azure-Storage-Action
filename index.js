const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const core = require('@actions/core');
const { BlobServiceClient } = require('@azure/storage-blob');

const readdir = promisify(fs.readdir);

const listFiles = async function* (dir){
    const files = await readdir(dir);
    for (const file of files){
        const fileName = path.join(dir, file);
        if(fs.statSync(fileName).isDirectory()){
            yield *listFiles(fileName);
        }else{
            yield fileName;
        }
    }
}

const main = async () => {

    const connectionString = core.getInput('connection-string');
    if (!connectionString) {
        throw "Connection string must be specified!";
    }

    const enableStaticWebSite = core.getInput('enabled-static-website');
    const containerName = (enableStaticWebSite) ? "$web" : core.getInput('blob-container-name') ;
    if (!containerName) {
        throw "Container name must be specified, or enableStaticWebSite set to true!";
    }

    const folder = core.getInput('folder');
    const accessPolicy = core.getInput('public-access-policy');
    const indexFile = core.getInput('index-file') || 'index.html';;
    const errorFile = core.getInput('error-file') || 'index.html';
    const removeExistingFiles = core.getInput('remove-existing-files');

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
        var blobName = path.relative(rootFolder, file);
        var blobClient = containerService.getBlockBlobClient(blobName);
        await blobClient.uploadFile(file);
        console.log(path.relative(rootFolder, file));
    }

};

main().catch(err => {
    console.error(err);
    console.error(err.stack);
    core.setFailed(err);
    process.exit(-1);
})