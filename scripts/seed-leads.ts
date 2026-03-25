import { ingestRawLeads } from "../agents/hunter"
import { closeDb } from "../core/utils/db"

async function main() {
  await ingestRawLeads([
    {
      source: "reddit",
      source_type: "post",
      external_id: "reddit_001",
      author_handle: "ops_user_1",
      url: "https://reddit.com/example-1",
      title: "We spend hours reconciling CSV exports manually every week",
      body: "Finance ops team comparing rows in Excel. Mismatches and duplicates keep breaking reports.",
    },
    {
      source: "reddit",
      source_type: "comment",
      external_id: "reddit_002",
      author_handle: "data_user_9",
      url: "https://reddit.com/example-2",
      title: "Need better way to compare two files",
      body: "Current process is painful and manual. Looking for a reliable way to audit differences.",
    },
    {
      source: "job_board",
      source_type: "job_post",
      external_id: "job_001",
      author_handle: "company_xyz",
      url: "https://jobs.example.com/finance-data-analyst",
      title: "Hiring Finance Data Analyst for reconciliation and reporting",
      body: "Strong experience with reconciliations, exceptions, data quality, reporting, and month-end processes required.",
    },
  ])

  console.log("Seed lead ingestion complete.")
  await closeDb()
}

main().catch(async (err) => {
  console.error(err)
  await closeDb()
  process.exit(1)
})
