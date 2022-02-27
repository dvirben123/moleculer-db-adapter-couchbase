//@ts-nocheck
import CouchbaseAdapter from '../../src/index.ts';
import ModuleChecker from '../../../moleculer-db/test/checker';
import Promise from 'bluebird';
import Posts from '../models/posts';

const adapter = new CouchbaseAdapter(
  process.env.COUCHBASE_URI || 'couchbase://localhost',
  { bucketName: 'posts', username: 'root', password: '123456' },
);

const checker = new ModuleChecker(21);

// Start checks
const start = async () => {
  await Promise.delay(500);

  adapter.init(null, {
    schema: {
      model: Posts,
      name: 'posts',
    },
  });
  await adapter.connect();
  await adapter.clear();

  Promise.resolve()
    .delay(1000)
    .then(async () => await checker.execute())
    .catch(console.error)
    // .then(() => broker.stop())
    .then(() => checker.printTotal());
};

// --- TEST CASES ---

let ids = [];
let date = new Date();

// Count of posts
checker.add(
  'COUNT 0',
  () => adapter.count(),
  (res) => {
    console.log(res);
    return res === 0;
  },
);

// Insert a new Post
checker.add(
  'INSERT',
  () =>
    adapter.insert({
      title: 'Hello',
      content: 'Post content',
      votes: 3,
      status: true,
      createdAt: date,
    }),
  async (doc) => {
    ids[0] = doc.id;
    console.log('Saved: ', doc);

    return (
      doc.id &&
      doc.title === 'Hello' &&
      doc.content === 'Post content' &&
      doc.votes === 3 &&
      doc.status === true &&
      new Date(doc.createdAt).getTime() === date.getTime()
    );
  },
);

// Find
checker.add(
  'FIND 1',
  () => adapter.find({}),

  (res) => {
    console.log('FIND results: ', res);
    return res.length === 1 && res[0].id === ids[0];
  },
);

// Find by ID
checker.add(
  'GET',
  () => adapter.findById(ids[0]),
  (res) => {
    console.log(res);
    return res.id === ids[0];
  },
);

// Count of posts
checker.add(
  'COUNT 1',
  () => adapter.count(),
  (res) => {
    console.log(res);
    return res === 1;
  },
);

// Insert many new Posts
checker.add(
  'INSERT MANY',
  () =>
    adapter.insertMany([
      {
        title: 'Second',
        content: 'Second post content',
        votes: 8,
        status: true,
        createdAt: new Date(),
      },
      {
        title: 'Last',
        content: 'Last document',
        votes: 1,
        status: false,
        createdAt: new Date(),
      },
    ]),
  (docs) => {
    console.log('Saved: ', docs);
    ids[1] = docs[0].id;
    ids[2] = docs[1].id;

    return [
      docs.length === 2,
      ids[1] && docs[0].title === 'Second' && docs[0].votes === 8,
      ids[1] &&
        docs[1].title === 'Last' &&
        docs[1].votes === 1 &&
        docs[1].status === false,
    ];
  },
);

// Count of posts
checker.add(
  'COUNT 3',
  () => adapter.count(),
  (res) => {
    console.log(res);
    return res === 3;
  },
);

// Find
checker.add(
  'FIND by selector',
  () => adapter.find({ title: 'Last' }),
  async (res) => {
    console.log(res, ids);
    const isValid = res.length === 1 && res[0].id === ids[2];
    await Promise.delay(15000);
    return isValid;
  },
);

// Find
checker.add(
  'FIND by limit, sort, query',
  () =>
    adapter.find({
      limit: 1,
      sort: { votes: 'DESC', title: 'DESC' },
      skip: 1,
    }),
  (res) => {
    console.log(res, ids);
    return res.length === 1 && res[0].id === ids[0];
  },
);

// Find
checker.add(
  'FIND by query ($gt)',
  () => adapter.find({ selector: { votes: { $gt: 2 } } }),
  (res) => {
    console.log(res);
    return res.length === 2;
  },
);

// Find
checker.add(
  'COUNT by query ($gt)',
  () => adapter.count({ votes: { $gt: 2 } }),
  (res) => {
    console.log(res);
    return res === 2;
  },
);

// dd by IDs
checker.add(
  'GET BY IDS',
  () => adapter.findByIds([ids[2], ids[0]]),
  (res) => {
    console.log(res);
    return res.length === 2;
  },
);

// Update a posts
checker.add(
  'UPDATE',
  () =>
    adapter.updateById(ids[2], {
      title: 'Last 2',
      updatedAt: new Date(),
      status: true,
    }),
  (doc) => {
    console.log('Updated: ', doc);
    return (
      doc.id &&
      doc.title === 'Last 2' &&
      doc.content === 'Last document' &&
      doc.votes === 1 &&
      doc.status === true &&
      doc.updatedAt
    );
  },
);

// Update by query
checker.add(
  'UPDATE BY QUERY',
  () =>
    adapter.updateMany(
      { votes: { $lt: 5 } },
      {
        status: false,
      },
    ),
  (items) => {
    console.log('Updated: ', items);
    return items.message.data.length === 2;
  },
);

// Remove by query
checker.add(
  'REMOVE BY QUERY',
  () => adapter.removeMany({ votes: { $lt: 5 } }),
  (cases) => {
    console.log('Removed: ', cases);
    return cases.length === 2;
  },
);

// Count of posts
checker.add(
  'COUNT 1',
  () => adapter.count(),
  (res) => {
    console.log(res);
    return res === 1;
  },
);

// Remove by ID
checker.add(
  'REMOVE BY ID',
  () => adapter.removeById(ids[1]),
  (doc) => {
    console.log('Removed: ', doc);
    return doc && doc.cas !== null;
  },
);

// Count of posts
checker.add(
  'COUNT 0',
  () => adapter.count(),
  (res) => {
    console.log(res);
    return res === 0;
  },
);

// Clear
checker.add(
  'CLEAR',
  () => adapter.clear(),
  (res) => {
    console.log('CLEARRRR', res);
    return res.length === 0;
  },
);

start();
