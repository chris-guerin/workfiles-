// node: Output Summary
// id:   a252fb5f-12f3-49be-8ba5-a4d72c9c18d8
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
const data = $input.first().json;
if (data.skip_yamm || data.parse_error) {
  return [{ json: { complete: true, yamm_generated: false, reason: data.reason || data.error } }];
}
return [{ json: {
  complete: true,
  yamm_generated: true,
  today_topic: data.today_topic,
  today: data.today,
  contact_count: data.row_count,
  signal_summary: data.email_variants && data.email_variants.signal_summary_one_line,
  yamm_csv: data.yamm_csv,
  filename: data.suggested_filename
} }];