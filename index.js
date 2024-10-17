const username = 'feinberg';
const baseUrl = `https://mcsrranked.com/api/users/${username}/matches`;
const currentTime = new Date();
const startTime = new Date(currentTime.getTime() - 50 * 60 * 60 * 1000); // 1 hour ago

let wonMatchesCount = 0;
let page = 0;
let continueChecking = true;

while (continueChecking) {
  console.log(`fetching page ${page + 1}`)
  const url = `${baseUrl}?count=25&page=${page}`;
  const res = await fetch(url);
  const data = await res.json();
  const matches = data['data'];

  if (matches.length === 0) {
    break; // No more matches to fetch
  }

  for (const match of matches) {
    const matchDate = new Date(parseInt(match['date']) * 1000);
    
    if (matchDate < startTime) {
      continueChecking = false;
      break; // Stop checking as we've reached matches outside our time range
    }

    if (match.result && match.result.uuid === '9a8e24df4c8549d696a6951da84fa5c4') {
      wonMatchesCount++;
    }
  }

  page++;
}

console.log(`Number of matches won since ${startTime.toISOString()}: ${wonMatchesCount}`);