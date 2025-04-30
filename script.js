document.getElementById('linkForm').addEventListener('submit', (event) => {
    event.preventDefault();

    const urlInput = document.getElementById('url').value.trim();

    if (!urlInput) {
        alert('Please enter a valid URL.');
        return;
    }

    // Custom encoding: simple and reliable
    const encodedUrl = btoa(urlInput); // Base64 encoding

    // Generate the short link
    const shortLink = `${window.location.origin}/l/?=${encodedUrl}`;
    document.getElementById('output').textContent = `Short link created: ${shortLink}`;
});
