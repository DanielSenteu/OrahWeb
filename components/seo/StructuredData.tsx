export default function StructuredData() {
  const softwareApp = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "ORAH",
    "applicationCategory": "EducationalApplication",
    "operatingSystem": "Web",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "ratingCount": "1000"
    },
    "description": "AI-powered academic planning tool that transforms syllabi, assignments, and exams into structured daily tasks. Beat procrastination and achieve academic success.",
    "featureList": [
      "Semester Planning from Syllabi",
      "Assignment Breakdown & Planning",
      "Exam Prep with Spaced Repetition",
      "Lecture Notes Generation",
      "AI-Powered Task Management",
      "Procrastination Help",
      "Goal Tracking & Organization"
    ]
  }

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "ORAH",
    "url": "https://orahai.app",
    "potentialAction": {
      "@type": "SearchAction",
      "target": "https://orahai.app/search?q={search_term_string}",
      "query-input": "required name=search_term_string"
    }
  }

  const organization = {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    "name": "ORAH",
    "url": "https://orahai.app",
    "description": "AI-powered academic planning and productivity platform for students"
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApp) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
    </>
  )
}
