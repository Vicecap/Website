const p = window.__POST__;
const postDiv = document.getElementById("post");

postDiv.innerHTML = `
<h1>${p.title}</h1>
<img src="${p.image}">
<div>${p.content}</div>
`;
