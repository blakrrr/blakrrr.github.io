const fs = require('fs');
const replace = require('replace-in-file');
const packageJson = require('./package.json');

const version = packageJson.version;
const files = ['index.html', 'chat.html'];

const options = {
    files: files.map(file => `d:\\downloads\\hatchat\\blakrrr.github.io\\${file}`),
    from: /hatchat - \d+\.\d+\.\d+\.\d+/g,
    to: `hatchat - ${version}`,
};

replace(options)
    .then(results => {
        console.log('Replacement results:', results);
    })
    .catch(error => {
        console.error('Error occurred:', error);
    });