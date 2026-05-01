// node: Code in JavaScript1
// id:   e88bbe00-9850-4263-b6f1-99ce9b5524a2
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
return $input.all().map(item => {
  return {
    json: {
      ...item.json,
      title: (item.json.title || '')
        .replace(/"/g, "'")
        .replace(/\\/g, '')
        .replace(/[\n\r\t]/g, ' ')
        .trim()
    }
  };
});