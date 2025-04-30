document.getElementById('linkForm').addEventListener('submit', (event) => {
    event.preventDefault();

    const urlInput = document.getElementById('url').value.trim();

    if (!urlInput) {
        alert('Please enter a valid URL.');
        return;
    }

    // Encode the URL for redirection
    const encodedUrl = customEncode(urlInput);

    // Generate the short link
    const shortLink = `${window.location.origin}/l/?=${encodedUrl}`;
    document.getElementById('output').textContent = `Short link created: ${shortLink}`;
});

function customEncode(url) {
    return btoa(url); // Encode using Base64 for simplicity
}
