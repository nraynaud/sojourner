DROP TABLE IF EXISTS files;
DROP TABLE IF EXISTS stop_words;
CREATE TABLE IF NOT EXISTS files
(
    path
        varchar PRIMARY KEY,
    content
        text,
    token_count
        INTEGER
);
COMMENT ON TABLE files IS 'full text indexed files';
CREATE TABLE IF NOT EXISTS pdsfiles
(
    path
        varchar PRIMARY KEY,
    text_content
        text,
    bin_content
        blob
);
CREATE TABLE IF NOT EXISTS stop_words
(
    word
        varchar,
);
COMMENT ON TABLE stop_words IS 'English language stop words for full text index';

CREATE TABLE IF NOT EXISTS dict
(
    id INTEGER,
    word
       varchar,
    df INTEGER
);
COMMENT ON TABLE dict IS 'List of all the words stems in the corpus';
COMMENT ON COLUMN dict.df IS 'Number of documents containing this stem';

CREATE TABLE IF NOT EXISTS words (
    path
        varchar,
    word_id
        INTEGER,
    occurrences_count
        INTEGER
);

COMMENT ON TABLE words IS 'Occurrence of words in the documents';

CREATE VIEW "statistics" AS SELECT count(*) AS doc_count, avg("token_count") AS doc_avg_len FROM "files";
COMMENT ON COLUMN statistics.doc_count IS 'total doc count';
COMMENT ON COLUMN statistics.doc_avg_len IS 'average token count in doc (skipping stop words)';

-- copied from duckdb/fts
CREATE FUNCTION tokenize(s TEXT) AS (string_split_regex(regexp_replace(lower(strip_accents(CAST(s AS VARCHAR))), '[0-9!@#$%^&*()_+={}\[\]:;<>,.?~\\/\|''''"`-]+', ' ', 'g'), '\s+'));;

-- copied from duckdb/fts
CREATE FUNCTION custom_bm25(tf, df, doc_len, num_docs, avgdl, k, b) AS
    (log(((((num_docs - df) + 0.5) / (df + 0.5)) + 1)) *
        ((tf * (k + 1)) / (tf +
        (k * ((1 - b) + (b * (doc_len / avgdl)))))));

CREATE FUNCTION stop_stems() AS TABLE
    SELECT DISTINCT stem(word, 'porter') as stop_stem FROM stop_words ORDER BY stop_stem
;
CREATE FUNCTION create_index_table() AS TABLE
    WITH raw_tokens AS (SELECT unnest(tokenize(content)) AS token, "path" FROM files),
         distinct_tokens AS (SELECT token, count(*) AS "count", "path"
                             FROM raw_tokens GROUP BY ALL),
         raw_stems AS (SELECT stem(token, 'porter') AS "stem", "count", "path"
                       FROM distinct_tokens
                       WHERE token NOT NULL
                            AND len(token) > 0),
         distincs_stems AS (SELECT stem, sum("count") AS "count", path FROM raw_stems WHERE "stem" NOT IN (FROM stop_stems()) GROUP BY ALL ORDER BY stem, path)
    SELECT row_number() OVER (ORDER BY stem) AS id, stem AS word, path, count FROM distincs_stems ORDER BY stem;


CREATE FUNCTION tokenize_search(query_string Text) AS TABLE
    WITH q_words AS (SELECT DISTINCT stem(unnest(tokenize(query_string)), 'porter') AS q_word)
    SELECT id from dict, q_words WHERE word=q_word;

CREATE FUNCTION custom_search_bm25(query_string TEXT, k := 1.2, b := 0.75, conjunctive := false) AS TABLE
    WITH needles AS (FROM tokenize_search(query_string)),
         documents AS (SELECT words.word_id, files.path, files.token_count, words.occurrences_count FROM words, needles, files WHERE needles.id = words.word_id AND files.path=words.path),
         individual_scores AS (SELECT documents.word_id, documents.path, custom_bm25(documents.occurrences_count, dict.df, documents.token_count, (SELECT doc_count FROM statistics), (SELECT doc_avg_len FROM statistics), k, b) AS score
                               FROM documents, dict
                               WHERE dict.id = documents.word_id),
        consolidated_scores AS (SELECT sum(score) as score, count(word_id) as needle_count, path from individual_scores GROUP BY ALL)
    SELECT score, path FROM consolidated_scores
                    WHERE CASE WHEN conjunctive THEN
                        -- needle_count is compared to tokenized, to skip stop words and common stem words
                        needle_count = (SELECT count(*) FROM needles)
                    ELSE TRUE END
;


INSERT INTO stop_words Select unnest(['a', 'a''s', 'able', 'about', 'above', 'according', 'accordingly', 'across',
                              'actually', 'after', 'afterwards', 'again', 'against', 'ain''t', 'all', 'allow', 'allows',
                              'almost', 'alone', 'along', 'already', 'also', 'although', 'always', 'am', 'among',
                              'amongst', 'an', 'and', 'another', 'any', 'anybody', 'anyhow', 'anyone', 'anything',
                              'anyway', 'anyways', 'anywhere', 'apart', 'appear', 'appreciate', 'appropriate', 'are',
                              'aren''t', 'around', 'as', 'aside', 'ask', 'asking', 'associated', 'at', 'available',
                              'away', 'awfully', 'b', 'be', 'became', 'because', 'become', 'becomes', 'becoming',
                              'been', 'before', 'beforehand', 'behind', 'being', 'believe', 'below', 'beside',
                              'besides', 'best', 'better', 'between', 'beyond', 'both', 'brief', 'but', 'by', 'c',
                              'c''mon', 'c''s', 'came', 'can', 'can''t', 'cannot', 'cant', 'cause', 'causes', 'certain',
                              'certainly', 'changes', 'clearly', 'co', 'com', 'come', 'comes', 'concerning',
                              'consequently', 'consider', 'considering', 'contain', 'containing', 'contains',
                              'corresponding', 'could', 'couldn''t', 'course', 'currently', 'd', 'definitely',
                              'described', 'despite', 'did', 'didn''t', 'different', 'do', 'does', 'doesn''t', 'doing',
                              'don''t', 'done', 'down', 'downwards', 'during', 'e', 'each', 'edu', 'eg', 'eight',
                              'either', 'else', 'elsewhere', 'enough', 'entirely', 'especially', 'et', 'etc', 'even',
                              'ever', 'every', 'everybody', 'everyone', 'everything', 'everywhere', 'ex', 'exactly',
                              'example', 'except', 'f', 'far', 'few', 'fifth', 'first', 'five', 'followed', 'following',
                              'follows', 'for', 'former', 'formerly', 'forth', 'four', 'from', 'further', 'furthermore',
                              'g', 'get', 'gets', 'getting', 'given', 'gives', 'go', 'goes', 'going', 'gone', 'got',
                              'gotten', 'greetings', 'h', 'had', 'hadn''t', 'happens', 'hardly', 'has', 'hasn''t',
                              'have', 'haven''t', 'having', 'he', 'he''s', 'hello', 'help', 'hence', 'her', 'here',
                              'here''s', 'hereafter', 'hereby', 'herein', 'hereupon', 'hers', 'herself', 'hi', 'him',
                              'himself', 'his', 'hither', 'hopefully', 'how', 'howbeit', 'however', 'i', 'i''d',
                              'i''ll', 'i''m', 'i''ve', 'ie', 'if', 'ignored', 'immediate', 'in', 'inasmuch', 'inc',
                              'indeed', 'indicate', 'indicated', 'indicates', 'inner', 'insofar', 'instead', 'into',
                              'inward', 'is', 'isn''t', 'it', 'it''d', 'it''ll', 'it''s', 'its', 'itself', 'j', 'just',
                              'k', 'keep', 'keeps', 'kept', 'know', 'knows', 'known', 'l', 'last', 'lately', 'later',
                              'latter', 'latterly', 'least', 'less', 'lest', 'let', 'let''s', 'like', 'liked', 'likely',
                              'little', 'look', 'looking', 'looks', 'ltd', 'm', 'mainly', 'many', 'may', 'maybe', 'me',
                              'mean', 'meanwhile', 'merely', 'might', 'more', 'moreover', 'most', 'mostly', 'much',
                              'must', 'my', 'myself', 'n', 'name', 'namely', 'nd', 'near', 'nearly', 'necessary',
                              'need', 'needs', 'neither', 'never', 'nevertheless', 'new', 'next', 'nine', 'no',
                              'nobody', 'non', 'none', 'noone', 'nor', 'normally', 'not', 'nothing', 'novel', 'now',
                              'nowhere', 'o', 'obviously', 'of', 'off', 'often', 'oh', 'ok', 'okay', 'old', 'on',
                              'once', 'one', 'ones', 'only', 'onto', 'or', 'other', 'others', 'otherwise', 'ought',
                              'our', 'ours', 'ourselves', 'out', 'outside', 'over', 'overall', 'own', 'p', 'particular',
                              'particularly', 'per', 'perhaps', 'placed', 'please', 'plus', 'possible', 'presumably',
                              'probably', 'provides', 'q', 'que', 'quite', 'qv', 'r', 'rather', 'rd', 're', 'really',
                              'reasonably', 'regarding', 'regardless', 'regards', 'relatively', 'respectively', 'right',
                              's', 'said', 'same', 'saw', 'say', 'saying', 'says', 'second', 'secondly', 'see',
                              'seeing', 'seem', 'seemed', 'seeming', 'seems', 'seen', 'self', 'selves', 'sensible',
                              'sent', 'serious', 'seriously', 'seven', 'several', 'shall', 'she', 'should',
                              'shouldn''t', 'since', 'six', 'so', 'some', 'somebody', 'somehow', 'someone', 'something',
                              'sometime', 'sometimes', 'somewhat', 'somewhere', 'soon', 'sorry', 'specified', 'specify',
                              'specifying', 'still', 'sub', 'such', 'sup', 'sure', 't', 't''s', 'take', 'taken', 'tell',
                              'tends', 'th', 'than', 'thank', 'thanks', 'thanx', 'that', 'that''s', 'thats', 'the',
                              'their', 'theirs', 'them', 'themselves', 'then', 'thence', 'there', 'there''s',
                              'thereafter', 'thereby', 'therefore', 'therein', 'theres', 'thereupon', 'these', 'they',
                              'they''d', 'they''ll', 'they''re', 'they''ve', 'think', 'third', 'this', 'thorough',
                              'thoroughly', 'those', 'though', 'three', 'through', 'throughout', 'thru', 'thus', 'to',
                              'together', 'too', 'took', 'toward', 'towards', 'tried', 'tries', 'truly', 'try',
                              'trying', 'twice', 'two', 'u', 'un', 'under', 'unfortunately', 'unless', 'unlikely',
                              'until', 'unto', 'up', 'upon', 'us', 'use', 'used', 'useful', 'uses', 'using', 'usually',
                              'uucp', 'v', 'value', 'various', 'very', 'via', 'viz', 'vs', 'w', 'want', 'wants', 'was',
                              'wasn''t', 'way', 'we', 'we''d', 'we''ll', 'we''re', 'we''ve', 'welcome', 'well', 'went',
                              'were', 'weren''t', 'what', 'what''s', 'whatever', 'when', 'whence', 'whenever', 'where',
                              'where''s', 'whereafter', 'whereas', 'whereby', 'wherein', 'whereupon', 'wherever',
                              'whether', 'which', 'while', 'whither', 'who', 'who''s', 'whoever', 'whole', 'whom',
                              'whose', 'why', 'will', 'willing', 'wish', 'with', 'within', 'without', 'won''t',
                              'wonder', 'would', 'wouldn''t', 'x', 'y', 'yes', 'yet', 'you', 'you''d',
                              'you''ll', 'you''re', 'you''ve', 'your', 'yours', 'yourself', 'yourselves', 'z', 'zero']);
