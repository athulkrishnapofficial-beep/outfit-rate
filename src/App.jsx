import { useState } from 'react';

// You can get a simple "sparkle" icon from a React icon library like 'lucide-react'
// (run `npm install lucide-react`)
// import { Sparkles } from 'lucide-react';

function App() {
  const [prompt, setPrompt] = useState(''); // The user's text question
  const [image, setImage] = useState(null); // The image file
  const [imagePreview, setImagePreview] = useState(null); // The URL for the <img> tag
  const [result, setResult] = useState(''); // The AI's text response
  const [loading, setLoading] = useState(false); // To show a loading spinner

  /**
   * Handles the file input change when a user selects an image.
   */
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);

      // Create a temporary URL for the image preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  /**
   * Converts a file to a base64 string.
   * This is what we'll send to the AI model.
   */
  const toBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]); // Get just the base64 part
    reader.onerror = (error) => reject(error);
  });

  /**
   * Handles the form submission.
   * This will convert the image and call our backend.
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!image || !prompt) {
      alert("Please upload an image and ask a question.");
      return;
    }

    setLoading(true);
    setResult(''); // Clear previous results

    try {
      // 1. Convert the image to a base64 string
      const imageBase64 = await toBase64(image);

      // 2. This is the data we'll send to our backend
      const dataToSend = {
        image: imageBase64,
        prompt: prompt,
      };

      // 3. Call our backend serverless function (see notes below)
      // We are "awaiting" the response from our server
      // const response = await fetch('/api/analyze-outfit', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(dataToSend),
      // });

      // const aiResponse = await response.json();

      // 4. --- MOCKUP ---
      // For now, we'll just show a fake AI response.
      // Remove this `setTimeout` when you build your backend.
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate AI thinking
      const aiResponse = {
        analysis: "### Your Outfit Analysis\n\nThis is a great start for a date!\n\n* **Color Palette:** The navy blue jacket and white shirt are a classic combo. The colors work well together.\n* **Ornaments:** A simple silver watch would be a perfect accessory here. \n* **Suggestions:** The jeans are a good choice, but make sure your shoes are clean! A pair of brown leather loafers or clean white sneakers would complete this look."
      };
      // --- END MOCKUP ---

      if (!aiResponse.analysis) {
        throw new Error('Failed to get a response from the AI.');
      }

      setResult(aiResponse.analysis);

    } catch (error) {
      console.error("Error:", error);
      setResult(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-900 text-white p-4 md:p-10">
      <div className="w-full max-w-2xl">
        {/* --- HEADER --- */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
            AI Fashion Advisor
          </h1>
          <p className="text-gray-400 mt-2">
            Upload your 'fit. Get it roasted (or rated).
          </p>
        </div>

        {/* --- UPLOAD AREA & PREVIEW --- */}
        <div className="bg-gray-800 p-6 rounded-xl shadow-lg mb-6">
          <h2 className="text-lg font-semibold mb-3">Upload Your 'Fit</h2>
          <div
            className={`flex justify-center items-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer
              ${imagePreview ? 'border-purple-400' : 'border-gray-600 hover:border-gray-500'}
              bg-cover bg-center`}
            style={{ backgroundImage: `url(${imagePreview})` }}
            onClick={() => document.getElementById('file-input').click()}
          >
            {!imagePreview && (
              <div className="text-center text-gray-400">
                <p>Click to upload an image</p>
                <p className="text-sm">(PNG, JPG)</p>
              </div>
            )}
          </div>
          <input
            id="file-input"
            type="file"
            accept="image/png, image/jpeg"
            className="hidden"
            onChange={handleImageChange}
          />
        </div>

        {/* --- FORM --- */}
        <form onSubmit={handleSubmit}>
          {/* --- TEXT PROMPT --- */}
          <div className="bg-gray-800 p-6 rounded-xl shadow-lg mb-6">
            <label htmlFor="prompt" className="text-lg font-semibold mb-3 block">
              Ask Your Question
            </label>
            <input
              id="prompt"
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., How is this for a date?"
              className="w-full p-3 bg-gray-700 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* --- SUBMIT BUTTON --- */}
          <button
            type="submit"
            disabled={loading || !image || !prompt}
            className="w-full text-lg font-bold p-4 rounded-lg shadow-lg flex justify-center items-center
                      bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600
                      disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? (
              <div className="w-6 h-6 border-4 border-t-transparent border-white rounded-full animate-spin"></div>
            ) : (
              'Analyze My Outfit'
            )}
          </button>
        </form>

        {/* --- RESULT AREA --- */}
        {result && (
          <div className="bg-gray-800 p-6 rounded-xl shadow-lg mt-8">
            <h2 className="text-2xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
              Analysis
            </h2>
            {/* This `prose` class from Tailwind formats HTML tags nicely */}
            <div
              className="prose prose-invert text-gray-300"
              dangerouslySetInnerHTML={{ __html: result.replace(/\n/g, '<br />') }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;