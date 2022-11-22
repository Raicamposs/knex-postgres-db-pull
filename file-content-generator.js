function generator(schema, table, fields, constraints) {
  const columns = fields.map((field) => {
    let column = "table";

    switch (field.data_type) {
      case "timestamp without time zone":
      case "timestamp with time zone":
        column = column + `.timestamp('${field.column_name}')`;
        break;
      case "time without time zone":
        column = column + `.time('${field.column_name}')`;
        break;
      case "numeric":
        column =
          column +
          `.decimal('${field.column_name}',${field.numeric_precision},${field.numeric_scale})`;
        break;
      case "character varying":
        column =
          column +
          `.string('${field.column_name}',${
            field.character_maximum_length ?? 255
          })`;
        break;
      case "character":
        column = column + `.string('${field.column_name}', 1)`;
        break;
      case "uuid":
        column = column + `.uuid('${field.column_name}')`;
        break;
      default:
        if ((field.column_default ?? "").includes("nextval"))
          column = column + `.increments('${field.column_name}')`;
        else column = column + `.${field.data_type}('${field.column_name}')`;
    }

    column =
      column + (field.is_nullable === "NO" ? ".notNullable()" : ".nullable()");

    if (field.column_default) {
      const column_default = field.column_default.replace(
        /^\(?(.+)(::)([A-z0-9 ]+)\)?$/,
        "$1"
      );

      switch (field.data_type) {
        case "integer":
        case "bigint":
        case "boolean":
        case "numeric":
        case "real":
          if (!(field.column_default ?? "").includes("nextval"))
            column = column + `.defaultTo(${column_default})`;
          break;
        default:
          column =
            column + `.defaultTo(\`${column_default.replaceAll(`'`, "")}\`)`;
      }
    }

    return column;
  });

  const foreignKeys = constraints.map((constraint) => {
    switch (constraint?.constraint_type ?? "") {
      case "PRIMARY KEY":
        return `table.primary(['${constraint.column_name}'],{constraintName:'${constraint.constraint_name}'})`;

      case "FOREIGN KEY":
        return `table
        .foreign('${constraint.column_name}','${constraint.constraint_name}')
        .references('${constraint.foreign_column_name}')
        .inTable('${constraint.foreign_table_schema}.${constraint.foreign_table_name}') 
      `;

      case "UNIQUE":
        return `table.unique([${constraint.column_name
          .split(",")
          .map((i) => `'${i}'`)
          .join(",")}],{indexName:'${constraint.constraint_name}'})`;
    }
  });

  return `
import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  knex.schema.withSchema('${schema}').hasTable('${table}').then( (exists) => {
    if (!exists) {
      return knex.schema.withSchema('${schema}').alterTable('${table}', (table) => {
        ${[...columns, "", ...foreignKeys].join("\n        ")}
      })
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.withSchema('${schema}').dropTable('${table}')
}
`;
}

module.exports = gen;
