'use strict';

const chai = require('chai');

const expect = chai.expect;
const Support = require('../../support');
const { DataTypes, Op } = require('@sequelize/core');
const { QueryBuilder } = require('../../../lib/expression-builders/query-builder');

const dialect = Support.getTestDialect();

// Get the appropriate quote character for the current dialect
function getQuoteChar(dialectName) {
  switch (dialectName) {
    case 'postgres':
    case 'snowflake':
      return '"';
    case 'mysql':
    case 'mariadb':
    case 'sqlite3':
      return '`';
    case 'mssql':
      return ['[', ']'];
    default:
      return '"'; // default to double quotes
  }
}

const quoteChar = getQuoteChar(dialect);
const openQuote = Array.isArray(quoteChar) ? quoteChar[0] : quoteChar;
const closeQuote = Array.isArray(quoteChar) ? quoteChar[1] : quoteChar;

// Helper function to quote identifiers
function q(identifier) {
  return `${openQuote}${identifier}${closeQuote}`;
}

function b(bool) {
  switch (dialect) {
    case 'mssql':
    case 'sqlite3':
      return bool === 'true' ? '1' : '0';
    default:
      return bool;
  }
}

describe(Support.getTestDialectTeaser('QueryBuilder'), () => {
  let sequelize;
  let User;
  let Post;

  beforeEach(async () => {
    sequelize = Support.createSequelizeInstance();

    User = sequelize.define(
      'User',
      {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        name: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        email: {
          type: DataTypes.STRING,
          allowNull: false,
          unique: true,
        },
        active: {
          type: DataTypes.BOOLEAN,
          defaultValue: true,
        },
        age: {
          type: DataTypes.INTEGER,
        },
      },
      {
        tableName: 'users',
      },
    );

    Post = sequelize.define(
      'Post',
      {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        title: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        content: {
          type: DataTypes.TEXT,
        },
        published: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
        },
      },
      {
        tableName: 'posts',
      },
    );

    User.hasMany(Post, { foreignKey: 'userId' });
    Post.belongsTo(User, { foreignKey: 'userId' });
    await User.sync();
    await User.truncate();
  });

  afterEach(() => {
    return sequelize?.close();
  });

  describe('Basic QueryBuilder functionality', () => {
    it('should generate basic SELECT query', () => {
      const query = User.select().getQuery();
      const expected = `SELECT * FROM ${q('users')} AS ${q('User')};`;
      expect(query).to.equal(expected);
    });

    it('should generate SELECT query with specific attributes', () => {
      const query = User.select().attributes(['name', 'email']).getQuery();
      const expected = `SELECT ${q('name')}, ${q('email')} FROM ${q('users')} AS ${q('User')};`;
      expect(query).to.equal(expected);
    });

    it('should generate SELECT query with WHERE clause', () => {
      const query = User.select().where({ active: true }).getQuery();
      const expected = `SELECT * FROM ${q('users')} AS ${q('User')} WHERE ${q('User')}.${q('active')} = ${b('true')};`;
      expect(query).to.equal(expected);
    });

    it('should generate SELECT query with multiple WHERE conditions', () => {
      const query = User.select().where({ active: true, age: 25 }).getQuery();
      const expected = `SELECT * FROM ${q('users')} AS ${q('User')} WHERE ${q('User')}.${q('active')} = ${b('true')} AND ${q('User')}.${q('age')} = 25;`;
      expect(query).to.equal(expected);
    });

    it('should generate complete SELECT query with attributes and WHERE', () => {
      const query = User.select().attributes(['name', 'email']).where({ active: true }).getQuery();
      const expected = `SELECT ${q('name')}, ${q('email')} FROM ${q('users')} AS ${q('User')} WHERE ${q('User')}.${q('active')} = ${b('true')};`;
      expect(query).to.equal(expected);
    });
  });

  describe('Functional/Immutable behavior', () => {
    it('should return new instances for each method call', () => {
      const builder1 = User.select();
      const builder2 = builder1.attributes(['name']);
      const builder3 = builder2.where({ active: true });

      expect(builder1).to.not.equal(builder2);
      expect(builder2).to.not.equal(builder3);
      expect(builder1).to.not.equal(builder3);
    });

    it('should not mutate original builder when chaining', () => {
      const baseBuilder = User.select();
      const builderWithAttributes = baseBuilder.attributes(['name']);
      const builderWithWhere = baseBuilder.where({ active: true });

      // Base builder should remain unchanged
      const baseQuery = baseBuilder.getQuery();
      const expectedBase = `SELECT * FROM ${q('users')} AS ${q('User')};`;
      expect(baseQuery).to.equal(expectedBase);

      // Other builders should have their modifications
      const attributesQuery = builderWithAttributes.getQuery();
      const expectedAttributes = `SELECT ${q('name')} FROM ${q('users')} AS ${q('User')};`;
      expect(attributesQuery).to.equal(expectedAttributes);

      const whereQuery = builderWithWhere.getQuery();
      const expectedWhere = `SELECT * FROM ${q('users')} AS ${q('User')} WHERE ${q('User')}.${q('active')} = ${b('true')};`;
      expect(whereQuery).to.equal(expectedWhere);
    });

    it('should allow building different queries from same base', () => {
      const baseBuilder = User.select().attributes(['name', 'email']);

      const activeUsersQuery = baseBuilder.where({ active: true }).getQuery();
      const youngUsersQuery = baseBuilder.where({ age: { [Op.lt]: 30 } }).getQuery();

      const expectedActive = `SELECT ${q('name')}, ${q('email')} FROM ${q('users')} AS ${q('User')} WHERE ${q('User')}.${q('active')} = ${b('true')};`;
      const expectedYoung = `SELECT ${q('name')}, ${q('email')} FROM ${q('users')} AS ${q('User')} WHERE ${q('User')}.${q('age')} < 30;`;

      expect(activeUsersQuery).to.equal(expectedActive);
      expect(youngUsersQuery).to.equal(expectedYoung);
    });
  });

  if (dialect.startsWith('postgres')) {
    describe('PostgreSQL-specific features', () => {
      it('should handle PostgreSQL operators correctly', () => {
        const query = User.select()
          .where({
            name: { [Op.iLike]: '%john%' },
            age: { [Op.between]: [18, 65] },
          })
          .getQuery();
        const expected = `SELECT * FROM "users" AS "User" WHERE "User"."name" ILIKE '%john%' AND ("User"."age" BETWEEN 18 AND 65);`;
        expect(query).to.equal(expected);
      });

      it('should handle array operations', () => {
        const query = User.select()
          .where({
            name: { [Op.in]: ['John', 'Jane', 'Bob'] },
          })
          .getQuery();
        const expected = `SELECT * FROM "users" AS "User" WHERE "User"."name" IN ('John', 'Jane', 'Bob');`;
        expect(query).to.equal(expected);
      });

      it('should quote identifiers properly for PostgreSQL', () => {
        const query = User.select()
          .attributes(['name', 'email'])
          .where({ active: true })
          .getQuery();

        const expected = `SELECT "name", "email" FROM "users" AS "User" WHERE "User"."active" = true;`;
        expect(query).to.equal(expected);
      });
    });
  }

  describe('Error handling', () => {
    it('should throw error when getQuery is called on non-select builder', () => {
      expect(() => {
        const builder = new QueryBuilder(User);
        builder.getQuery();
      }).to.throw();
    });

    it('should handle empty attributes array', () => {
      expect(() => {
        User.select().attributes([]).getQuery();
      }).to.throw(
        `Attempted a SELECT query for model 'User' as ${q('User')} without selecting any columns`,
      );
    });

    it('should handle null/undefined where conditions gracefully', () => {
      // null where should throw an error as it's invalid
      expect(() => {
        User.select().where(null).getQuery();
      }).to.throw();

      // undefined where should work (no where clause)
      expect(() => {
        User.select().where(undefined).getQuery();
      }).to.not.throw();
    });
  });

  describe('Complex WHERE conditions', () => {
    it('should handle complex nested conditions', () => {
      const query = User.select()
        .where({
          [Op.or]: [
            { active: true },
            {
              [Op.and]: [{ age: { [Op.gte]: 18 } }, { name: { [Op.like]: '%admin%' } }],
            },
          ],
        })
        .getQuery();

      const likePrefix = dialect === 'mssql' ? 'N' : '';
      const expected = `SELECT * FROM ${q('users')} AS ${q('User')} WHERE ${q('User')}.${q('active')} = ${b('true')} OR (${q('User')}.${q('age')} >= 18 AND ${q('User')}.${q('name')} LIKE ${likePrefix}'%admin%');`;
      expect(query).to.equal(expected);
    });

    it('should handle IS NULL conditions', () => {
      const query = User.select().where({ age: null }).getQuery();
      const expected = `SELECT * FROM ${q('users')} AS ${q('User')} WHERE ${q('User')}.${q('age')} IS NULL;`;
      expect(query).to.equal(expected);
    });

    it('should handle NOT NULL conditions', () => {
      const query = User.select()
        .where({ age: { [Op.ne]: null } })
        .getQuery();
      const expected = `SELECT * FROM ${q('users')} AS ${q('User')} WHERE ${q('User')}.${q('age')} IS NOT NULL;`;
      expect(query).to.equal(expected);
    });
  });

  describe('execute', () => {
    it('should execute the query', async () => {
      await User.create({ name: 'John', email: 'john@example.com', active: true });
      const result = await User.select()
        .attributes(['name'])
        .where({ active: true, name: 'John' })
        .execute();
      const [row] = result;
      expect(row).to.deep.equal([{ name: 'John' }]);
    });
  });
});
