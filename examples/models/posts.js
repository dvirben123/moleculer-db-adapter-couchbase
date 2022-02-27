'use strict';
const PostSchema = {};
PostSchema.timestamps = true;
PostSchema.collectionName = 'posts';
PostSchema.name = 'posts';
PostSchema.index = {};
// Add full-text search index
PostSchema.index.findByTitle = {
  by: 'title',
  type: 'n1ql',
};

const props = PostSchema;
// Add full-text search index
PostSchema.index.findByContent = {
  by: 'content',
  type: 'n1ql',
};

// module.exports = PostSchema;
const body = {
  title: {
    type: String,
  },
  content: {
    type: String,
  },
  votes: {
    type: Number,
    default: 0,
  },
  author: {
    type: String,
  },
  status: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
  },
};

module.exports = {
  body,
  props,
};
