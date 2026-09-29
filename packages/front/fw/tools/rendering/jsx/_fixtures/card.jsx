<article id="card">
  <h2 id="card-title">{title}</h2>
  <p id="card-body" class={bodyClass}>{summary}</p>
  <a id="card-link" href="/items/{id}" class="btn {btnClass}">Read more</a>
  <div id="card-slot"><Slot name="footer"/></div>
</article>
