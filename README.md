Real-Time Election Dashboard (2026 Second Round)
This project is a high-performance web dashboard designed for real-time aggregation, monitoring, and visualization of electoral data during
the 2026 Brazilian Presidential Runoff Election. It leverages a decoupled architecture that combines a resilient Node.js proxy and caching layer
with an interactive, data-driven frontend to deliver seamless performance during high-concurrency events.

To overcome potential performance bottlenecks and CORS constraints associated with polling public endpoints, the application introduces a proxy architecture. 
The Node.js Express backend mediates all incoming client requests to the official Superior Electoral Court (TSE) endpoint, serving cached payloads at optimized 
ten-second intervals. This strategy minimizes network latency and effectively guards against upstream rate-limiting.

The frontend interface combines dynamic state management with modern GIS mapping and analytical capabilities. Spatial vote distribution is visualized using
Leaflet.js with dynamic SVG and GeoJSON styling, allowing users to filter electoral statistics by state. Complementing the geospatial map, Chart.js provides
real-time historical tracking of vote progression, while reactive DOM updates dynamically rearrange candidate leaderboard cards according to live stream results.

Setting up the project locally requires Node.js version 18 or higher. After cloning the repository from GitHub and installing the required dependencies with npm
install, launching node server.js starts the proxy layer. The web application can then be accessed by opening index.html in any modern web browser or serving it
via a local web server such as Apache or Live Server.

The backend exposes two primary API endpoints for data consumption. The GET /api/tse/br route retrieves consolidated national election results alongside general
metadata, while GET /api/tse/:uf delivers state-specific metrics based on the requested two-letter state code. This project is open-source and available under
the MIT License.

To access the site, put this link in your browser: [https://apuracaoeleitoral.onrender.com/](https://apuracaoeleitoral.onrender.com/)
