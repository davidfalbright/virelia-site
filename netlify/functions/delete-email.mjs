<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Delete Email</title>
  </head>
  <body>
    <h1>Delete Your Email</h1>
    <form id="deleteForm">
      <label for="email">Email:</label>
      <input type="email" id="email" placeholder="Enter email to delete" required />
      <button type="submit">Delete</button>
    </form>

    <script>
      document.getElementById('deleteForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value;
        if (!email) {
          alert('Please provide an email');
          return;
        }

        try {
          const response = await fetch('/.netlify/functions/delete-email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email }),
          });

          const result = await response.json();
          if (response.ok) {
            alert('Email deleted successfully!');
          } else {
            alert('Failed to delete email: ' + result.error);
          }
        } catch (error) {
          alert('Error: ' + error.message);
        }
      });
    </script>
  </body>
</html>
