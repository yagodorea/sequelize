'use strict';

const chai = require('chai');

const expect = chai.expect;
const Support = require('../../support');
const { DataTypes, Op } = require('@sequelize/core');
const { QueryBuilder } = require('../../../lib/expression-builders/query-builder');
const { expectsql } = require('../../support');

const dialect = Support.getTestDialect();

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
      expectsql(() => User.select().getQuery(), {
        default: `SELECT * FROM [users] AS [User];`,
      });
    });

    it('should generate SELECT query with specific attributes', () => {
      expectsql(() => User.select().attributes(['name', 'email']).getQuery(), {
        default: `SELECT [name], [email] FROM [users] AS [User];`,
      });
    });

    it('should generate SELECT query with WHERE clause', () => {
      expectsql(() => User.select().where({ active: true }).getQuery(), {
        default: `SELECT * FROM [users] AS [User] WHERE [User].[active] = true;`,
        'mssql sqlite3': `SELECT * FROM [users] AS [User] WHERE [User].[active] = 1;`,
      });
    });

    it('should generate SELECT query with multiple WHERE conditions', () => {
      expectsql(() => User.select().where({ active: true, age: 25 }).getQuery(), {
        default: `SELECT * FROM [users] AS [User] WHERE [User].[active] = true AND [User].[age] = 25;`,
        'mssql sqlite3': `SELECT * FROM [users] AS [User] WHERE [User].[active] = 1 AND [User].[age] = 25;`,
      });
    });

    it('should generate complete SELECT query with attributes and WHERE', () => {
      expectsql(
        () => User.select().attributes(['name', 'email']).where({ active: true }).getQuery(),
        {
          default: `SELECT [name], [email] FROM [users] AS [User] WHERE [User].[active] = true;`,
          'mssql sqlite3': `SELECT [name], [email] FROM [users] AS [User] WHERE [User].[active] = 1;`,
        },
      );
    });

    it('should generate SELECT query with LIMIT', () => {
      expectsql(() => User.select().limit(10).getQuery(), {
        default: `SELECT * FROM [users] AS [User] ORDER BY [User].[id] LIMIT 10;`,
        mssql: `SELECT * FROM [users] AS [User] ORDER BY [User].[id] OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY;`,
      });
    });

    it('should generate SELECT query with LIMIT and OFFSET', () => {
      expectsql(() => User.select().limit(10).offset(5).getQuery(), {
        default: `SELECT * FROM [users] AS [User] ORDER BY [User].[id] LIMIT 10 OFFSET 5;`,
        mssql: `SELECT * FROM [users] AS [User] ORDER BY [User].[id] OFFSET 5 ROWS FETCH NEXT 10 ROWS ONLY;`,
      });
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
      expectsql(() => baseBuilder.getQuery(), {
        default: `SELECT * FROM [users] AS [User];`,
      });

      // Other builders should have their modifications
      expectsql(() => builderWithAttributes.getQuery(), {
        default: `SELECT [name] FROM [users] AS [User];`,
      });

      expectsql(() => builderWithWhere.getQuery(), {
        default: `SELECT * FROM [users] AS [User] WHERE [User].[active] = true;`,
        'mssql sqlite3': `SELECT * FROM [users] AS [User] WHERE [User].[active] = 1;`,
      });
    });

    it('should allow building different queries from same base', () => {
      const baseBuilder = User.select().attributes(['name', 'email']);

      expectsql(() => baseBuilder.where({ active: true }).getQuery(), {
        default: `SELECT [name], [email] FROM [users] AS [User] WHERE [User].[active] = true;`,
        'mssql sqlite3': `SELECT [name], [email] FROM [users] AS [User] WHERE [User].[active] = 1;`,
      });

      expectsql(() => baseBuilder.where({ age: { [Op.lt]: 30 } }).getQuery(), {
        default: `SELECT [name], [email] FROM [users] AS [User] WHERE [User].[age] < 30;`,
      });
    });
  });

  if (dialect.startsWith('postgres')) {
    describe('PostgreSQL-specific features', () => {
      it('should handle PostgreSQL operators correctly', () => {
        expectsql(
          () =>
            User.select()
              .where({
                name: { [Op.iLike]: '%john%' },
                age: { [Op.between]: [18, 65] },
              })
              .getQuery(),
          {
            default: `SELECT * FROM [users] AS [User] WHERE [User].[name] ILIKE '%john%' AND ([User].[age] BETWEEN 18 AND 65);`,
          },
        );
      });

      it('should handle array operations', () => {
        expectsql(
          () =>
            User.select()
              .where({
                name: { [Op.in]: ['John', 'Jane', 'Bob'] },
              })
              .getQuery(),
          {
            default: `SELECT * FROM [users] AS [User] WHERE [User].[name] IN ('John', 'Jane', 'Bob');`,
          },
        );
      });

      it('should quote identifiers properly for PostgreSQL', () => {
        expectsql(
          () => User.select().attributes(['name', 'email']).where({ active: true }).getQuery(),
          {
            default: `SELECT [name], [email] FROM [users] AS [User] WHERE [User].[active] = true;`,
          },
        );
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
      }).to.throw(/Attempted a SELECT query for model 'User' as .* without selecting any columns/);
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
      expectsql(
        () =>
          User.select()
            .where({
              [Op.or]: [
                { active: true },
                {
                  [Op.and]: [{ age: { [Op.gte]: 18 } }, { name: { [Op.like]: '%admin%' } }],
                },
              ],
            })
            .getQuery(),
        {
          default: `SELECT * FROM [users] AS [User] WHERE [User].[active] = true OR ([User].[age] >= 18 AND [User].[name] LIKE '%admin%');`,
          sqlite3: `SELECT * FROM \`users\` AS \`User\` WHERE \`User\`.\`active\` = 1 OR (\`User\`.\`age\` >= 18 AND \`User\`.\`name\` LIKE '%admin%');`,
          mssql: `SELECT * FROM [users] AS [User] WHERE [User].[active] = 1 OR ([User].[age] >= 18 AND [User].[name] LIKE N'%admin%');`,
        },
      );
    });

    it('should handle IS NULL conditions', () => {
      expectsql(() => User.select().where({ age: null }).getQuery(), {
        default: `SELECT * FROM [users] AS [User] WHERE [User].[age] IS NULL;`,
      });
    });

    it('should handle NOT NULL conditions', () => {
      expectsql(
        () =>
          User.select()
            .where({ age: { [Op.ne]: null } })
            .getQuery(),
        {
          default: `SELECT * FROM [users] AS [User] WHERE [User].[age] IS NOT NULL;`,
        },
      );
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
