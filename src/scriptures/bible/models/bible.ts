import * as ORM from 'sequelize';
import { sequelize } from '../../../db/db';
export const Bible = sequelize.define('bible', {
  id: {type : ORM.INTEGER,primaryKey:true},
  bookNo: ORM.INTEGER,
  chapterNo: ORM.INTEGER,
  verseNo: ORM.INTEGER,
  verse: ORM.STRING,
  edition: ORM.INTEGER,
  desc: ORM.STRING,
  lastModifiedDate: ORM.DATE,
  languageId: ORM.INTEGER
},{timestamps: false,freezeTableName:true,tableName:'bible'});