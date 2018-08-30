import { BibileVerses,BibileVerse } from './bibleInterfaces';
import { Bible } from './models/bible';
import { BibleChapters } from './models/bibleChapters';
import { Sequelize, LoggingOptions } from 'sequelize';
const Op = Sequelize.Op;
class BibleService {

    public getSingleVerse(bookNo:Number,chapterNo:Number,verseNO:Number){
        return Bible.findOne({
            where: {bookNo:{ [Op.eq]: bookNo }, chapterNo: { [Op.eq]: chapterNo }, verseNo:{ [Op.eq]: verseNO }}
        });
        //return null;
    }
}


export default new BibleService();