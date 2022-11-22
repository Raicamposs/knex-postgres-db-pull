const Knex = require("knex");
const gen = require("./file-content-generator");
const fs = require("fs");
const path = require("path");

require("dotenv").config();

const deleteFolderRecursive = function (directoryPath) {
  if (fs.existsSync(directoryPath)) {
    fs.readdirSync(directoryPath).forEach((file, index) => {
      const curPath = path.join(directoryPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        // recurse
        deleteFolderRecursive(curPath);
      } else {
        // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(directoryPath);
  }
};

const generate = async () => {
  let connection = Knex({
    client: "pg",
    connection: {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
    },
  });

  try {
    await connection.raw("select 1+1 as result");
    console.log("connection ok!");
  } catch (e) {
    console.error("connection error!");
    process.exit(1);
  }

  const { rows } = await connection.raw(`
  SELECT schemaname , tablename
    FROM pg_catalog.pg_tables
    WHERE schemaname != 'pg_catalog' AND 
        schemaname = 'public'
    `);

  if (fs.existsSync("./migrations")) {
    deleteFolderRecursive("./migrations");
  }

  fs.mkdirSync("./migrations");

  await Promise.all(
    rows.map(async ({ schemaname, tablename }) => {
      let { rows: columns = [] } = await connection.raw(`
      SELECT  *
      FROM information_schema.columns   
      WHERE 
      table_schema = '${schemaname}' AND table_name = '${tablename}' 
    `);

      let { rows: constraints = [] } = await connection.raw(`
        with tabela as (
            SELECT 
                tc.constraint_name,
                tc.constraint_type,
                ccu.table_schema AS foreign_table_schema,
                ccu.table_name AS foreign_table_name,
                kcu.column_name,
                ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints AS tc
                JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
            WHERE   tc.table_schema = '${schemaname}'
                  AND tc.table_name='${tablename}'
                  AND  tc.constraint_type in ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY')
            order by kcu.ordinal_position
            )
            
        SELECT  constraint_name,
                constraint_type,
                  foreign_table_schema,
                  foreign_table_name,
                string_agg(DISTINCT column_name, ', ') AS column_name,
                string_agg(DISTINCT foreign_column_name, ', ') AS foreign_column_name
        from tabela
        GROUP by 1,
                  2,
                  3,
                  4
    `);

      const file = gen(schemaname, tablename, columns, constraints);

      const now = new Date();
      const nowPart = [
        now.getFullYear(),
        now.getMonth() + 1,
        now.getDate(),
        now.getHours(),
        now.getMinutes(),
        now.getSeconds(),
      ]
        .map((v) => v.toString().padStart(2, "0"))
        .join("");

      fs.writeFile(
        `./migrations/${nowPart}_create_${schemaname}_${tablename}.ts`,
        file,
        function (err) {
          if (err) {
            return console.log(err);
          }
        }
      );
    })
  )
    .catch(console.error)
    .finally(() => {
      connection.destroy();
      process.exit(0);
    });
};

generate();
