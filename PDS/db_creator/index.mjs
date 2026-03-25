import * as duckdb from '@duckdb/duckdb-wasm'
import * as tesseract from 'node-tesseract-ocr'
import * as child_process from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import * as path from 'path'
import Worker from 'web-worker'

const exec = promisify(child_process.exec)

let path1 = new URL(import.meta.resolve('@duckdb/duckdb-wasm')).pathname
const DUCKDB_DIST = path.dirname(path1)
const DUCKDB_CONFIG = await duckdb.selectBundle({
  mvp: {
    mainModule: path.resolve(DUCKDB_DIST, './duckdb-mvp.wasm'),
    mainWorker: path.resolve(DUCKDB_DIST, './duckdb-node-mvp.worker.cjs'),
  }, eh: {
    mainModule: path.resolve(DUCKDB_DIST, './duckdb-eh.wasm'),
    mainWorker: path.resolve(DUCKDB_DIST, './duckdb-node-eh.worker.cjs'),
  }, coi: {
    coi: {
      mainModule: path.resolve(DUCKDB_DIST, './duckdb-coi.wasm'),
      mainWorker: path.resolve(DUCKDB_DIST, './duckdb-node-eh.worker.cjs'),
    }
  }
})
console.log('mainWorker:', DUCKDB_CONFIG.mainWorker)
let worker = new Worker(DUCKDB_CONFIG.mainWorker, {type: 'module'})
const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.DEBUG)
let db = new duckdb.AsyncDuckDB(logger, worker)
await db.instantiate(DUCKDB_CONFIG.mainModule, DUCKDB_CONFIG.pthreadWorker)
let conn = await db.connect()

console.log((await conn.query(await readFile('ddl.sql', {encoding: 'utf8'}))).toString())
console.log((await conn.query(`FROM stop_stems();`)).toString())
console.log((await conn.query(`
    DROP TABLE IF EXISTS filesinput;
    CREATE TABLE filesinput
    (
        path    varchar primary key,
        content varchar
    );
`)).toString())

const prepared = await conn.prepare(`INSERT INTO filesinput
                                     VALUES (?::varchar, ?::text) ON CONFLICT DO
UPDATE
    SET content=EXCLUDED.content;`)

const temp_dir = await mkdtemp(join(tmpdir(), 'pdf-'))
try {

  let pdfRoot = '../../literature'
  const pdfs = (await readdir(pdfRoot)).filter(fname => fname.endsWith('.pdf')).map(fname => join(pdfRoot, fname))
  console.log('pdfs', pdfs)

  async function ocrWork (fname) {
    const filepath = join(temp_dir, fname)
    const text = await tesseract.recognize(filepath)
    // "mech design_eisen1997.pdf-6.png" -> ["mech design_eisen1997", "6.png"]
    const [prefix, suffix] = basename(fname).split('.pdf-')
    const pageNumber = suffix.split('.png')[0]
    const dbFileUrl = `/literature/${prefix}.pdf#page=${pageNumber}`
    await prepared.query(dbFileUrl, text)
    console.log('saved page', dbFileUrl)
  }

  async function convertPDF (pdfName, outdir) {
    //pdftocairo -png -scale-to 1024 ../StdRef_20090227_v3.8.pdf test_
    let pdfBasename = basename(pdfName)
    const outPrefix = join(outdir, pdfBasename)
    console.log('converting', pdfName)
    await exec(`pdftocairo -png "${pdfName}" "${outPrefix}"`)
    const tempFiles = (await readdir(temp_dir)).filter(fpath => basename(fpath).startsWith(pdfBasename))
    return tempFiles.map(fname => async () => ocrWork(fname))
  }

  /**
   * https://timtech.blog/posts/limiting-async-operations-promise-concurrency-javascript/
   * @param tasks an array of async functions taking zero parameters and returning an array of the same (representing downstream work to be added to the queue)
   * @param CONCURRENT_WORKERS
   * @return {Promise<void>}
   */
  async function runWithLimitedConcurrency (tasks, CONCURRENT_WORKERS = navigator.hardwareConcurrency) {
    const allDone = Promise.withResolvers()
    const waitingWorkers = new Set()

    function resumeWaitingWorkers () {
      // avoid messing the iterator with add/delete in the loop
      const waitListCopy = [...waitingWorkers]
      for (const worker of waitListCopy) {
        // let the async slip to get concurrency
        worker()
      }
    }

    function createWorker (next_, _id) {
      const worker = async () => {
        waitingWorkers.delete(worker)
        try {
          let task
          while ((task = next_())) {
            const result = await task()
            if (Array.isArray(result) && result.length) {
              tasks.push(...result)
              resumeWaitingWorkers()
            }
          }
        } catch (err) {
          console.log(err)
          console.log('logging and resuming')
        }
        waitingWorkers.add(worker)
        if (waitingWorkers.size === CONCURRENT_WORKERS) {
          allDone.resolve(undefined)
        }
      }
      return worker
    }

    for (let i = 0; i < CONCURRENT_WORKERS; i++) {
      waitingWorkers.add(createWorker(tasks.pop.bind(tasks), i))
    }
    resumeWaitingWorkers()
    await allDone.promise
    console.log('work done')
  }

  await runWithLimitedConcurrency(pdfs.map(file => (async () => convertPDF(file, temp_dir))))

  // order the rows for the output table
  console.log((await conn.query(`INSERT INTO files (path, content)
                                 SELECT *
                                 from filesinput
                                 ORDER BY path;`)).toString())
  console.log((await conn.query(`DROP TABLE filesinput;`)).toString())
  console.log((await conn.query(`CREATE
  TEMPORARY TABLE stems_docs AS FROM create_index_table();`)).toString())
  console.log((await conn.query(`INSERT INTO dict
                                 SELECT min(id) as id, word, count(path) as df
                                 FROM stems_docs
                                 GROUP BY ALL;`)).toString())
  console.log((await conn.query(`INSERT INTO words
                                 SELECT stems_docs.path  AS path,
                                        dict.id          AS word_id,
                                        stems_docs.count AS occurrences_count
                                 FROM stems_docs,
                                      dict
                                 WHERE dict.word = stems_docs.word;`)).toString())
  console.log((await conn.query(`UPDATE files
                                 SET token_count = (SELECT sum("count")
                                                    FROM stems_docs
                                                    WHERE files.path = stems_docs.path
                                                    GROUP BY stems_docs.path);`)).toString())

  const target_dir = '../database'
  await rm(target_dir, {recursive: true, force: true})
  await mkdir(target_dir)
  console.log((await conn.query(`COPY files TO '${target_dir}/files.parquet' (FORMAT parquet);`)).toString())
  console.log((await conn.query(`COPY stop_words TO '${target_dir}/stop_words.parquet' (FORMAT parquet);`)).toString())
  console.log((await conn.query(`COPY dict TO '${target_dir}/dict.parquet' (FORMAT parquet);`)).toString())
  console.log((await conn.query(`COPY words TO '${target_dir}/words.parquet' (FORMAT parquet);`)).toString())
  console.log((await conn.query(`COPY statistics TO '${target_dir}/statistics.parquet' (FORMAT parquet);`)).toString())
  console.log((await conn.query(`COPY (FROM stop_stems()) TO '${target_dir}/stop_stems.parquet' (FORMAT parquet);`)).toString())
  await conn.close()
  worker.terminate()
  console.log('done')
} finally {
  await rm(temp_dir, {recursive: true, force: true})
}
