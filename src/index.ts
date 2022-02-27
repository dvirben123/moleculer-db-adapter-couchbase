//@ts-ignore
import _ from "lodash";
//@ts-ignore
import Promise from "bluebird";
//@ts-ignore
const couchbase = require("couchbase");

import { Ottoman, SearchConsistency, Schema, Query } from "ottoman";
import moleculer from "moleculer";
import { ServiceBroker, Service } from "moleculer";
import dotenv from "dotenv";
const { ServiceSchemaError } = moleculer.Errors;
//@ts-ignore
/**
 * Couchbase adpater for Moleculer DB service
 *
 * @name moleculer-db-adpater-couchbase
 * @module Service
 */
class CouchbaseAdapter {
  url: string;
  opts: any;
  bucketName: string;
  username: string;
  bucket: any;
  password: string;
  db: any;
  //@ts-ignore
  ottoman: Ottoman;
  //@ts-ignore
  broker: ServiceBroker;
  service: any;
  cluster: any;
  schema: any = null;
  modelName: string = "";

  /**
   * Creates an instance of Couchbase.
   * @param {String} url
   * @param {Object?} opts
   *
   * @memberof Couchbase
   */
  constructor(url: string, opts: any) {
    this.url = url;
    this.opts = opts;
    const { bucketName, username, password } = opts;
    this.bucketName = bucketName;
    this.username = username;
    this.password = password;
    this.db = null;
    dotenv.config({
      debug: true,
    });
    this.ottoman = new Ottoman({
      collectionName: "_default",
    });
  }

  /**
   * Initialize adapter
   *
   * @param {ServiceBroker} broker
   * @param {Service} service
   *
   * @memberof Couchbase
   */
  init(broker: ServiceBroker, service: any) {
    this.broker = broker;
    this.service = service;
    this.schema = service.schema.model;
    this.modelName =
      (service.schema && service.schema.model && service.schema.model.name) ||
      (service.schema && service.schema.modelName) ||
      service.schema.name;
    if (!this.modelName) {
      throw new ServiceSchemaError(
        "Missing `modelName` or `name` definition in schema of service!",
        null
      );
    }
  }

  /**
   * Connect to database
   *
   * @returns {Promise}
   *
   * @memberof Couchbase
   */
  async connect() {
    return new Promise(async (resolve: any, reject: any) => {
      try {
        const cluster = await couchbase.connect(this.url, {
          username: this.username,
          password: this.password,
        });

        this.cluster = cluster;

        this.ottoman = await this.ottoman.connect({
          connectionString: this.url,
          username: this.username,
          password: this.password,
          bucketName: this.bucketName,
        });

        const indexManager = await cluster.queryIndexes();
        const existingIndexes = await indexManager.getAllIndexes(
          this.bucketName
        );

        if (!existingIndexes.some((i: any) => i.isPrimary)) {
          await indexManager.createPrimaryIndex(this.bucketName);
        }

        let schema = new Schema(this.schema.body);
        for (const k in this.schema.props) {
          //@ts-ignore
          schema[k] = this.schema.props[k];
        }
        this.db = this.ottoman.model(this.modelName, schema);
        await this.ottoman.start();

        resolve();
      } catch (err) {
        console.log("Error in connect", err);
        reject();
        throw err;
      }
    });
  }

  /**
   * Disconnect from database
   *
   * @returns {Promise}
   *
   * @memberof Couchbase
   */
  disconnect() {
    this.db = null;
    return Promise.resolve();
  }

  /**
   * Insert an entity.
   *
   * @param {Object} entity
   * @returns {Promise<Object>} Return with the inserted document.
   *
   * @memberof Couchbase
   */
  async insert(entity: any) {
    const result = await this.db.create(entity);
    return Promise.resolve(result);
  }

  /**
   * Find an entity by ID.
   *
   * @param {String} _id
   * @returns {Promise<Object>} Return with the found document.
   *
   * @memberof Couchbase
   */
  async findById(_id: string) {
    const doc = await this.db.findById(_id);
    return Promise.resolve(doc);
  }

  /**
   * Remove an entity by ID
   *
   * @param {String} _id - ObjectID as hexadecimal string.
   * @returns {Promise<Object>} Return with the removed document.
   *
   * @memberof Couchbase
   */
  async removeById(_id: string) {
    let doc = null;
    try {
      doc = await this.findById(_id);
      const removedDoc = await doc.remove();
      return Promise.resolve(removedDoc);
    } catch (err) {
      console.log("Failed to remove document by id", err);
      return false;
    }
  }

  /**
   * Remove the bucket name from the items in row results.
   * @param {*} query
   * @returns
   */
  selectAs(query: string) {
    const select = `SELECT * FROM \`${this.bucketName}\``;
    const allSelect = `SELECT d.* FROM \`${this.bucketName}\` AS d`;
    query = query.replace(select, allSelect);
    return query;
  }

  /**
   * Find all entities by filters.
   *
   * Available filter props:
   *    - limit
   *  - offset
   *  - sort
   *  - search
   *  - searchFields
   *  - selector
   *
   * @param {Object} filters
   * @returns {Promise<Array>}
   *
   * @memberof Couchbase
   */
  async find(filters: any, select: any = null) {
    try {
      let where = null;
      let query = new Query({}, this.bucketName);
      let selector = filters.selector ? filters.selector : filters;

      if (filters.limit) {
        query = query.limit(filters.limit);
        delete selector.limit;
      }
      if (filters.skip) {
        query = query.offset(filters.skip);
        delete selector.skip;
      }
      if (filters.sort) {
        query = query.orderBy(filters.sort);
        delete selector.sort;
      }

      if (filters.selector) {
        where = { ...filters.selector };
      } else if (!_.isEmpty(filters)) {
        where = { ...filters };
      }

      if (where === null) {
        where = { _type: `${this.schema.props.collectionName}` };
      } else {
        where = {
          $and: [where, { _type: `${this.schema.props.collectionName}` }],
        };
      }

      let n1qlQuery = query.select(select).where(where).build();
      // REMOVE BUCKET NAME FROM RESULTS
      n1qlQuery = this.selectAs(n1qlQuery);

      // FORCE THE QUERY TO WAIT FOR INDEX UPDATE TO COMPLETE
      let results = await this.ottoman.query(n1qlQuery, {
        scanConsistency: couchbase.QueryScanConsistency.RequestPlus,
      });
      return Promise.resolve(results.rows);
    } catch (err) {
      console.log(`failed to find query: err`, err);
    }
  }

  /**
   * Find an entity by selector
   *
   * @param {Object} params
   * @returns {Promise}
   * @memberof MemoryDbAdapter
   */
  findOne(params: any) {
    const findParams = Object.assign({}, params.selector || params, {
      limit: 1,
    });
    return this.find(findParams).then((docs) =>
      docs && docs.length ? docs[0] : null
    );
  }

  /**
   * Find any entities by IDs.
   *
   * @param {Array} idList
   * @returns {Promise<Array>} Return with the found documents in an Array.
   *
   * @memberof Couchbase
   */
  async findByIds(idList: [string]) {
    let query: Query = new Query({}, this.bucketName);
    const where = {
      _type: this.schema.props.collectionName,
      id: { $in: idList },
    };
    let queryString: string = query.select().where(where).build();
    queryString = this.selectAs(queryString);
    const docs = await this.ottoman.query(queryString);
    return Promise.resolve(docs.rows);
  }

  /**
   * Insert many entities
   *
   * @param {Array} entities
   * @returns {Promise<Array<Object>>} Return with the inserted documents in an Array.
   *
   * @memberof Couchbase
   */
  async insertMany(entities: any) {
    const results = [];
    for (let index = 0; index < entities.length; index++) {
      const entity = entities[index];
      const entityResult = await this.db.create(entity);
      results.push(entityResult);
    }

    return Promise.resolve(results);

    // return Promise.resolve(
    // 	this.db
    // 		.bulk({ docs: entities })
    // 		.then((result) => result.map((el) => el.id))
    // 		.then((ids) => this.findByIds(ids))
    // );
  }

  /**
   * Update many entities by `selector` and `update`
   *
   * @param {Object} selector
   * @param {Object} update
   * @returns {Promise<Number>} Count of modified documents.
   *
   * @memberof Couchbase
   */
  async updateMany(selector: any, update: any) {
    const updatedDoc = await this.db.updateMany(selector, update);
    return Promise.resolve(updatedDoc);
  }

  /**
   * Remove entities which are matched by `selector`
   *
   * @param {Object} selector
   * @returns {Promise<Number>} Return with the count of deleted documents.
   *
   * @memberof Couchbase
   */
  async removeMany(selector: any) {
    try {
      const removeResult = await this.db.removeMany(selector, {
        consistency: SearchConsistency.GLOBAL,
      });
      return Promise.resolve(removeResult.message.data);
    } catch (err) {
      console.error("Failed to remove many", err);
    }
    // .then((docs) => this.db.update({ docs }))
    // .then((result) => result.length);
  }

  /**
   * Get count of filtered entites.
   *
   * Available filter props:
   * - selector (json) – JSON object describing criteria used to select documents. More information provided in the section on selector syntax. Required
   * - limit (number) – Maximum number of results returned. Default is 25. Optional
   * - skip (number) – Skip the first ‘n’ results, where ‘n’ is the value specified. Optional
   * - sort (json) – JSON array following sort syntax. Optional
   *
   * @param {Object} [filters={}]
   * @returns {Promise<Number>} Return with the count of documents.
   *
   * @memberof Couchbase
   */
  async count(filters = {}) {
    return await this.db.count(filters);
  }

  /**
   * Update an entity by ID and `update`
   *
   * @param {String} id - ObjectID as hexadecimal string.
   * @param {Object} update
   * @returns {Promise<Object>} Return with the updated document.
   *
   * @memberof Couchbase
   */
  async updateById(id: string, update: any) {
    const res = await this.db.updateById(id, update);
    return Promise.resolve(res);
  }

  /**
   * Clear all entities from collection
   *
   * @returns {Promise}
   *
   * @memberof Couchbase
   */
  clear() {
    console.log(
      "Clear................................................................"
    );
    return this.removeMany({});
  }

  /**
   * Convert DB entity to JSON object. It converts the `_id` to hexadecimal `String`.
   *
   * @param {Object} entity
   * @returns {Object}
   * @memberof Couchbase
   */
  entityToObject(entity: any) {
    return _.cloneDeep(entity);
  }

  /**
   * Transforms 'idField' into CouchDB's '_id'
   * @param {Object} entity
   * @param {String} idField
   * @memberof Couchbase
   * @returns {Object} Modified entity
   */
  beforeSaveTransformID(entity: any, idField: string) {
    let newEntity = _.cloneDeep(entity);
    if (idField !== "_id" && newEntity[idField] !== undefined) {
      newEntity._id = newEntity[idField];
      delete newEntity[idField];
    }
    return newEntity;
  }

  /**
   * Transforms '_id' into user defined 'idField'
   * @param {Object} entity
   * @param {String} idField
   * @memberof Couchbase
   * @returns {Object} Modified entity
   */
  afterRetrieveTransformID(entity: any, idField: string) {
    if (idField !== "_id") {
      entity[idField] = entity["_id"];
      delete entity._id;
    }
    return entity;
  }
}

export default CouchbaseAdapter;
