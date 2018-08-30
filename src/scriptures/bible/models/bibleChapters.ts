import * as ORM from 'sequelize';
import { sequelize } from '../../../db/db';
import { Bible } from './bible';
export const BibleChapters = sequelize.define('bibleChapters', {
  chapterNo: ORM.INTEGER,
  chapterName: ORM.STRING,
  chapterDesc: ORM.STRING,
  lastModifiedDate: ORM.DATE,
  chapterAuthor: ORM.STRING,
  dateWritten: ORM.DATE,
  testament: ORM.CHAR
});

BibleChapters.hasMany(Bible, { foreignKey: 'chapterNo' });
Bible.belongsTo(BibleChapters, { foreignKey: 'chapterNo' });