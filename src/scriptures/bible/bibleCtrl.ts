import * as express from 'express';
import {BibileVerses,BibileVerse} from './bibleInterfaces';
import BibleService from './bibleService';
import { apiErrorHandler } from '../../handler/errorHandler';

class BibleCtrl {
    
    public getSingleVerse(req:express.Request,res:express.Response){
        BibleService.getSingleVerse(req.params.bookId,req.params.chapterId,req.params.verseId).
        then(result => {return res.json(result)})
        .catch(err => {
          apiErrorHandler(err, req, res, 'Fetch All Courses failed.');
        });
    }
}

export default function(){
    return new BibleCtrl();
}