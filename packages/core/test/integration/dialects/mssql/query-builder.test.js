'use strict';

const chai = require('chai');

const expect = chai.expect;
const Support = require('../../support');
const { DataTypes, Op } = require('@sequelize/core');

const dialect = Support.getTestDialect();

if (dialect.startsWith('mssql')) {
  describe('[MSSQL] QueryBuilder', () => {
    let sequelize;
    let User;
    let Post;

    beforeEach(async () => {
      sequelize = Support.createSingleTestSequelizeInstance();

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
    });

    afterEach(() => {
      return sequelize?.close();
    });

    describe('Basic QueryBuilder functionality', () => {
      it('should generate basic SELECT query', () => {
        const query = User.select().getQuery();
        expect(query).to.equal('SELECT * FROM [users] AS [User];');
      });

      it('should generate SELECT query with specific attributes', () => {
        const query = User.select().attributes(['name', 'email']).getQuery();
        expect(query).to.equal('SELECT [name], [email] FROM [users] AS [User];');
      });

      it('should generate SELECT query with WHERE clause', () => {
        const query = User.select().where({ active: true }).getQuery();
        expect(query).to.equal('SELECT * FROM [users] AS [User] WHERE [User].[active] = 1;');
      });

      it('should generate SELECT query with multiple WHERE conditions', () => {
        const query = User.select().where({ active: true, age: 25 }).getQuery();
        expect(query).to.equal(
          'SELECT * FROM [users] AS [User] WHERE [User].[active] = 1 AND [User].[age] = 25;',
        );
      });

      it('should generate complete SELECT query with attributes and WHERE', () => {
        const query = User.select()
          .attributes(['name', 'email'])
          .where({ active: true })
          .getQuery();
        expect(query).to.equal(
          'SELECT [name], [email] FROM [users] AS [User] WHERE [User].[active] = 1;',
        );
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
        expect(baseQuery).to.equal('SELECT * FROM [users] AS [User];');

        // Other builders should have their modifications
        const attributesQuery = builderWithAttributes.getQuery();
        expect(attributesQuery).to.equal('SELECT [name] FROM [users] AS [User];');

        const whereQuery = builderWithWhere.getQuery();
        expect(whereQuery).to.equal('SELECT * FROM [users] AS [User] WHERE [User].[active] = 1;');
      });

      it('should allow building different queries from same base', () => {
        const baseBuilder = User.select().attributes(['name', 'email']);

        const activeUsersQuery = baseBuilder.where({ active: true }).getQuery();
        const youngUsersQuery = baseBuilder.where({ age: { [Op.lt]: 30 } }).getQuery();

        expect(activeUsersQuery).to.equal(
          'SELECT [name], [email] FROM [users] AS [User] WHERE [User].[active] = 1;',
        );
        expect(youngUsersQuery).to.equal(
          'SELECT [name], [email] FROM [users] AS [User] WHERE [User].[age] < 30;',
        );
      });
    });

    describe('MSSQL-specific features', () => {
      it('should handle MSSQL operators correctly', () => {
        const query = User.select()
          .where({
            name: { [Op.like]: '%john%' },
            age: { [Op.between]: [18, 65] },
          })
          .getQuery();
        expect(query).to.include('LIKE');
        expect(query).to.include('BETWEEN');
      });

      it('should handle array operations', () => {
        const query = User.select()
          .where({
            name: { [Op.in]: ['John', 'Jane', 'Bob'] },
          })
          .getQuery();
        expect(query).to.include('IN');
        expect(query).to.include("N'John'");
        expect(query).to.include("N'Jane'");
        expect(query).to.include("N'Bob'");
      });

      it('should quote identifiers properly for MSSQL', () => {
        const query = User.select()
          .attributes(['name', 'email'])
          .where({ active: true })
          .getQuery();

        // MSSQL uses square brackets for identifiers
        expect(query).to.include('[name]');
        expect(query).to.include('[email]');
        expect(query).to.include('[users]');
        expect(query).to.include('[User]');
        expect(query).to.include('[User].[active]');
      });

      it('should handle boolean values as 1/0', () => {
        const query = User.select().where({ active: true }).getQuery();
        expect(query).to.include('= 1');

        const falseQuery = User.select().where({ active: false }).getQuery();
        expect(falseQuery).to.include('= 0');
      });
    });

    describe('Error handling', () => {
      it('should throw error when getQuery is called on non-select builder', () => {
        expect(() => {
          const builder = new (User.select().constructor)(User);
          builder.getQuery();
        }).to.throw();
      });

      it('should handle empty attributes array', () => {
        expect(() => {
          User.select().attributes([]).getQuery();
        }).to.throw(
          "Attempted a SELECT query for model 'User' as [User] without selecting any columns",
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

    describe('Integration with different models', () => {
      it('should work with different models', () => {
        const userQuery = User.select().attributes(['name']).getQuery();
        const postQuery = Post.select().attributes(['title']).getQuery();

        expect(userQuery).to.equal('SELECT [name] FROM [users] AS [User];');
        expect(postQuery).to.equal('SELECT [title] FROM [posts] AS [Post];');
      });

      it('should use correct table names and aliases', () => {
        const query = User.select().getQuery();
        expect(query).to.include('[users]');
        expect(query).to.include('AS [User]');

        const postQuery = Post.select().getQuery();
        expect(postQuery).to.include('[posts]');
        expect(postQuery).to.include('AS [Post]');
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

        expect(query).to.include('OR');
        expect(query).to.include('AND');
        expect(query).to.be.a('string');
      });

      it('should handle IS NULL conditions', () => {
        const query = User.select().where({ age: null }).getQuery();
        expect(query).to.include('IS NULL');
      });

      it('should handle NOT NULL conditions', () => {
        const query = User.select()
          .where({ age: { [Op.ne]: null } })
          .getQuery();
        expect(query).to.include('IS NOT NULL');
      });
    });
  });
}
