// 'use strict';

// const moduleName = process.argv[2] || 'simple';
// process.argv.splice(2, 1);
// console.log('module name', moduleName);
// require('./' + moduleName);
import broker from './simple';
//@ts-ignore
broker.start();
