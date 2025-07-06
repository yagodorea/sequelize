import type { WhereOptions } from '../abstract-dialect/where-sql-builder-types.js';
import type { FindAttributeOptions, Model, ModelStatic } from '../model.d.ts';
import type { Sequelize } from '../sequelize.js';
import { BaseSqlExpression, SQL_IDENTIFIER } from './base-sql-expression.js';

/**
 * Do not use me directly. Use Model.select() instead.
 */
export class QueryBuilder<M extends Model = Model> extends BaseSqlExpression {
  declare protected readonly [SQL_IDENTIFIER]: 'queryBuilder';

  private readonly _model: ModelStatic<M>;
  private _attributes?: FindAttributeOptions;
  private _where?: WhereOptions;
  private readonly _sequelize: Sequelize;
  private _isSelect: boolean = false;

  constructor(model: ModelStatic<M>) {
    super();
    this._model = model;
    this._sequelize = model.sequelize;
  }

  /**
   * Initialize a SELECT query
   *
   * @returns The query builder instance for chaining
   */
  select(): QueryBuilder<M> {
    const newBuilder = new QueryBuilder(this._model);
    newBuilder._isSelect = true;
    if (this._attributes !== undefined) {
      newBuilder._attributes = this._attributes;
    }

    if (this._where !== undefined) {
      newBuilder._where = this._where;
    }

    return newBuilder;
  }

  /**
   * Specify which attributes to select
   *
   * @param attributes - Array of attribute names or attribute options
   * @returns The query builder instance for chaining
   */
  attributes(attributes: FindAttributeOptions): QueryBuilder<M> {
    const newBuilder = new QueryBuilder(this._model);
    newBuilder._isSelect = this._isSelect;
    newBuilder._attributes = attributes;
    newBuilder._where = this._where;

    return newBuilder;
  }

  /**
   * Add WHERE conditions to the query
   *
   * @param conditions - Where conditions object
   * @returns The query builder instance for chaining
   */
  where(conditions: WhereOptions): QueryBuilder<M> {
    const newBuilder = new QueryBuilder(this._model);
    newBuilder._isSelect = this._isSelect;
    if (this._attributes !== undefined) {
      newBuilder._attributes = this._attributes;
    }

    newBuilder._where = conditions;

    return newBuilder;
  }

  /**
   * Generate the SQL query string
   *
   * @returns The SQL query
   */
  getQuery(): string {
    if (!this._isSelect) {
      throw new Error('Query builder requires select() to be called first');
    }

    const queryGenerator = this._model.queryGenerator;
    const tableName = this._model.tableName;

    // Build the options object that matches Sequelize's FindOptions pattern
    const options: any = {
      attributes: this._attributes,
      where: this._where,
      raw: true,
      plain: false,
    };

    // Generate the SQL using the existing query generator
    const sql = queryGenerator.selectQuery(tableName, options, this._model);

    return sql;
  }

  /**
   * Executes the raw query
   *
   * @returns The result of the query
   */
  async execute(): Promise<[unknown[], unknown]> {
    const sql = this.getQuery();

    return this._sequelize.queryRaw(sql);
  }

  /**
   * Get the table name for this query
   *
   * @returns The table name
   */
  get tableName(): string {
    return this._model.tableName;
  }

  /**
   * Get the model class
   *
   * @returns The model class
   */
  get model(): ModelStatic<M> {
    return this._model;
  }
}

/**
 * Creates a new QueryBuilder instance for the given model
 *
 * @param model - The model class
 * @returns A new query builder instance
 */
export function createQueryBuilder<M extends Model>(model: ModelStatic<M>): QueryBuilder<M> {
  return new QueryBuilder(model);
}
