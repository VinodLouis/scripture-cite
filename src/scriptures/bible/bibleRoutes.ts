import * as express from 'express';
import BibleCtrl from './bibleCtrl';

class BibleRoutes {
    public routeMatching: express.Router;

    constructor(){
        this.routeMatching = express.Router();
        this.routeMatching.get('/:bookId/:chapterId/:verseId',BibleCtrl().getSingleVerse)
    }
}

export default function(){
    return new BibleRoutes();
}