//@ts-nocheck
import fs from 'fs';
import DbService from 'moleculer-db';
import CouchbaseAdapter from '../../src/index.ts';

/**
 * @typedef {import('moleculer').Context} Context Moleculer's Context
 */

module.exports = function (collection) {
  const cacheCleanEventName = `cache.clean.${collection}`;

  const schema = {
    mixins: [DbService],

    events: {
      /**
       * Subscribe to the cache clean event. If it's triggered
       * clean the cache entries for this service.
       *
       * @param {Context} ctx
       */
      async [cacheCleanEventName]() {
        if (this.broker.cacher) {
          await this.broker.cacher.clean(`${this.fullName}.*`);
        }
      },
    },

    methods: {
      /**
       * Send a cache clearing event when an entity changed.
       *
       * @param {String} type
       * @param {any} json
       * @param {Context} ctx
       */
      async entityChanged(type, json, ctx) {
        ctx.broadcast(cacheCleanEventName);
      },
    },

    async started() {
      // Check the count of items in the DB. If it's empty,
      // call the `seedDB` method of the service.
      if (this.seedDB) {
        const count = await this.adapter.count();
        if (count == 0) {
          this.logger.info(
            `The '${collection}' collection is empty. Seeding the collection...`,
          );
          await this.seedDB();
          this.logger.info(
            'Seeding is done. Number of records:',
            await this.adapter.count(),
          );
        }
      }
    },
  };

  if (process.env.MONGO_URI) {
    // Mongo adapter
    const MongoAdapter = require('moleculer-db-adapter-mongo');

    schema.adapter = new MongoAdapter(process.env.MONGO_URI);
    schema.collection = collection;
  } else if (process.env.COUCHBASE_URI) {
    debugger;

    schema.adapter = new CouchbaseAdapter(process.env.COUCHBASE_URI);
    schema.collection = collection;
  } else if (process.env.TEST) {
    // NeDB memory adapter for testing
    schema.adapter = new DbService.MemoryAdapter();
  } else {
    // NeDB file DB adapter

    // Create data folder
    // if (!fs.existsSync("./data")) {
    // 	fs.mkdirSync("./data");
    // }

    // schema.adapter = new DbService.MemoryAdapter({
    // 	filename: `./data/${collection}.db`,
    // });

    // const CouchbaseAdapter = require('../../src/index').default;
    schema.adapter = new CouchbaseAdapter(
      process.env.COUCHBASE_URI || 'couchbase://localhost',
      {
        bucketName: 'posts',
        username: 'root',
        password: '123456',
      },
    );
    schema.collection = collection;
  }

  return schema;
};
