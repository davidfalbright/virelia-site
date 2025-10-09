async function loadRecords() {
  tableBody.innerHTML = '<tr><td colspan="6">Loading…</td></tr>';
  try {
    const res = await fetch("/.netlify/functions/list-tracking");
    const data = await res.json();
    tableBody.innerHTML = "";
    data.records.forEach(record => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${record.website}</td>
        <td>${record.hostedOn}</td>
        <td>${record.codeStoredOn}</td>
        <td>${record.websiteEmail}</td>
        <td>${record.corporateEmail}</td>
        <td>${record.aiDilemmaService}</td>
      `;
      tableBody.appendChild(tr);
    });
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="6">Failed to load records</td></tr>`;
    console.error(err);
  }
}
