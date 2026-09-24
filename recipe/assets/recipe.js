(() => {
  const search = document.querySelector('#recipe-search');
  if (!search) return;
  const cards = Array.from(document.querySelectorAll('[data-recipe]'));
  function render() {
    const query = search.value.trim().toLocaleLowerCase('ko');
    const numberQuery = query.match(/^(?:레시피\s*|recipe\s*)?0*(\d+)$/i);
    let count = 0;
    for (const card of cards) {
      const matches = numberQuery
        ? Number(card.dataset.recipe) === Number(numberQuery[1])
        : card.dataset.search.toLocaleLowerCase('ko').includes(query);
      const show = matches;
      card.hidden = !show;
      if (show) count++;
    }
    document.querySelector('#result-count').textContent = `${count}개 레시피`;
    document.querySelector('#no-results').hidden = count !== 0;
  }
  search.addEventListener('input', render);
})();
