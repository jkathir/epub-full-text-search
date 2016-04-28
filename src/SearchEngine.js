// * phrase search 
// * html teaser with tagged match

module.exports = function (options, callback) {

    var SearchEngine = {};

    const searchIndex = require('search-index');
    path = require('path'),
    fs = require('extfs'),
    _ = require('lodash'),
        
    preparer = require('./Preparer.js'),
    cfi = require('./CFI.js');

    const INDEX_DB = 'full-text-search-DB'; // path to index-db 
    var defaultOption = {'indexPath': INDEX_DB};
    var options = _.isEmpty(options) ? defaultOption : options;

    const DEFAULT_EPUB_TITLE = '*';


    searchIndex(options, function (err, si) {

        if (err)
            return callback(err, null)

        SearchEngine.si = si;
        return callback(null, SearchEngine)

    });

    SearchEngine.indexing = function (pathToEpubs, callback) {

        if (fs.isEmptySync(pathToEpubs)) {
            return callback(new Error('Can`t index empty folder: ' + pathToEpubs));
        }
        console.log("******************************************************");
        console.log("Step 1");
        console.log("start normalize epub content");

        path.normalize(pathToEpubs);

        preparer.normalize(pathToEpubs, function (dataSet) {

            console.log("******************************************************");
            console.log("ready normalize epub content");
            console.log("Step 2");
            console.log("start indexing");

            //console.log(dataSet);
            //fs.writeFileSync('./data1.json', JSON.stringify(dataSet) , 'utf-8');

            SearchEngine.add(dataSet, function (err) {

                if (callback) {
                    if (err)
                        callback(err);
                    else
                        callback('all is indexed');
                }
            });
        });
    };

    SearchEngine.add = function (jsonDoc, callback) {

        var ids = jsonDoc.FirstSpineItemsId;
        delete jsonDoc.FirstSpineItemsId;

        var opt = getIndexOptions();
        SearchEngine.si.add(jsonDoc, opt, callback);

    };

    SearchEngine.search = function (q, epubTitle, callback) {

        var epubTitle = epubTitle || DEFAULT_EPUB_TITLE; // if epubTitle undefined return all hits

        // q is an array !!!
        var query = {
            "query": {"*": q},
            "offset": 0,
            "pageSize": 100
        };

        SearchEngine.si.search(query, function (err, result) {

            if (err)
                console.error(err);

            if (result.hits) {

                var hits = [];
                for (var i in result.hits) {
                    
                    var title = result.hits[i].document.id.split(':')[1];
                    result.hits[i].document.id = result.hits[i].document.id.split(':')[0];

                    //console.log(result.hits[i].document);

                    if (title === epubTitle || epubTitle === '*') {

                        var data = {
                            "query": q,
                            "spineItemPath": result.hits[i].document.spineItemPath,
                            "baseCfi": result.hits[i].document.baseCfi
                        };

                        var cfiList = cfi.generate(data);

                        if (cfiList.length > 0) {
                            result.hits[i].document.cfis = cfiList;
                            delete result.hits[i].document['*'];
                            delete result.hits[i].document.spineItemPath;

                            hits.push(result.hits[i].document);
                        }
                    }
                }
                callback(hits);
            }
        })
    };

    SearchEngine.match = function (beginsWith, epubTitle, callback) {

        if (!_.isString(epubTitle) && !_.isNull(epubTitle))
            console.error('epubTitle should be null or type string');

        var epubTitle = epubTitle || DEFAULT_EPUB_TITLE;

        SearchEngine.si.match({beginsWith: beginsWith, type: 'ID'},

            function (err, matches) {
                return callback(err, filterMatches(matches, epubTitle));
            });
    };

    SearchEngine.empty = function (callback) {
        SearchEngine.si.empty(callback);
    };

    SearchEngine.close = function (callback) {
        SearchEngine.si.close(callback);
    };


    // private 
    function getIndexOptions() {

        var options = {};
        options.filters = [];
        options.fieldsToStore = ['id', 'spineItemPath', 'href', 'baseCfi', 'epubTitle'];
        options.fieldOptions = [
            {fieldName: 'epubTitle', searchable: false},
            {fieldName: 'spineItemPath', searchable: false},
            {fieldName: 'href', searchable: false},
            {fieldName: 'baseCfi', searchable: false},
            {fieldName: 'id', searchable: false}
        ];
        return options;
    }

    function filterMatches(matches, epubTitle) {

        var result = matches
            .map(function (match) {

                if (epubTitle === '*') {
                    // if epubTitle undefined return all matches
                    return match[0];
                } else {
                    var titles = match[1].map(function (id) {
                        // id = spineitemid:epubtitle
                        return id.split(':')[1]
                    });
                    return _.include(titles, epubTitle) ? match[0] : '';
                }
            })
            .filter(Boolean); // filter ["", "", ""] -> []
        return result;
    }
};