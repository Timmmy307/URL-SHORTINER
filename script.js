const mappingFile = 'links.json';

document.getElementById('linkForm').addEventListener('submit', (event) => {
    event.preventDefault();

    const urlInput = document.getElementById('url').value.trim();

    if (!urlInput) {
        alert('Original URL is required.');
        return;
    }

    // Generate a short code (hex)
    const shortCode = generateRandomHex();

    // Fetch and update the mapping file in memory
    fetch(mappingFile)
        .then(response => response.json())
        .then(mapping => {
            mapping[shortCode] = urlInput;

            // Display the short link
            document.getElementById('output').textContent = `Short link created: mainlink.test/?=${shortCode}`;
            console.log(mapping); // Simulated in-memory update for static sites
        })
        .catch(error => console.error('Error:', error));
});

// Generate an 8-character random hex code
function generateRandomHex() {
    return Math.random().toString(16).substr(2, 8);
}

// Handle redirection based on `/?=` in the URL
const urlParams = new URLSearchParams(window.location.search);
const shortCode = urlParams.get('=');

if (shortCode) {
    fetch(mappingFile)
        .then(response => response.json())
        .then(mapping => {
            if (mapping[shortCode]) {
                window.location.href = mapping[shortCode];
            } else {
                document.body.innerHTML = 'Invalid or missing link.';
            }
        })
        .catch(error => console.error('Error:', error));
}
