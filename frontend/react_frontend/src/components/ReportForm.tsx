import React, { useState } from 'react';

export const ReportForm: React.FC = () => {
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('description', description);
    if (file) {
      formData.append('image', file);
    }

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/reports`, {
        method: 'POST',
        body: formData,
      });
      if (response.ok) {
        setDescription('');
        setFile(null);
        alert('Report submitted successfully');
      }
    } catch (err) {
      console.error('Submission error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="report-form">
      <textarea
        placeholder="Describe the incident..."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        required
      />
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Uploading...' : 'Submit Incident Report'}
      </button>
    </form>
  );
};