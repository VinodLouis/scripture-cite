import * as ORM from 'sequelize';
import { Sequelize, LoggingOptions } from 'sequelize';
import Logger from '../Logger';
const log = Logger('Server');
const dbUrl = 'postgres://vinodlouis:vinodlouis@localhost:5432/scripture-cite';
const options: LoggingOptions = { benchmark: true, logging: log.info };
export const sequelize: Sequelize = new Sequelize('scripture-cite', 'vinodlouis', 'vinodlouis', {
  dialect: 'postgres',

  // custom host; default: localhost
  host: 'localhost',

  // custom port; default: dialect default
  port: 5432,

  // custom protocol; default: 'tcp'
  // postgres only, useful for Heroku
  protocol: null,

  // disable logging; default: console.log
  logging: false,

});

sequelize
  .authenticate()
  .then(() => {
    log.info('Connection has been established successfully.');
  })
  .catch(err => {
    log.error('Unable to connect to the database:', err);
  });
