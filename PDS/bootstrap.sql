-- needed for the C++ stem() function
INSTALL fts;
LOAD fts;
-- copied from duckdb/fts
CREATE FUNCTION tokenize(s TEXT) AS (string_split_regex(regexp_replace(lower(strip_accents(CAST(s AS VARCHAR))), '[0-9!@#$%^&*()_+={}\[\]:;<>,.?~\\/\|''''"`-]+', ' ', 'g'), '\s+'));;

-- copied from duckdb/fts
CREATE FUNCTION custom_bm25(tf, df, doc_len, num_docs, avgdl, k, b) AS
(log(((((num_docs - df) + 0.5) / (df + 0.5)) + 1)) *
    ((tf * (k + 1)) / (tf +
    (k * ((1 - b) + (b * (doc_len / avgdl)))))));

CREATE FUNCTION tokenize_search(query_string Text) AS TABLE
WITH dict AS (FROM query_table(getvariable('dict_table_name'))),
 q_words AS (SELECT DISTINCT stem(unnest(tokenize(query_string)), 'porter') AS q_word)
SELECT id from dict, q_words WHERE dict.word=q_word;


CREATE FUNCTION custom_search_bm25(query_string TEXT, k := 1.2, b := 0.75, conjunctive := false) AS TABLE
WITH needles AS (FROM tokenize_search(query_string)),
     words AS (FROM query_table(getvariable('words_table_name'))),
     files AS (FROM query_table(getvariable('files_table_name'))),
     dict AS (FROM query_table(getvariable('dict_table_name'))),
     statistics AS (FROM query_table(getvariable('statistics_table_name'))),
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
ORDER BY score DESC
