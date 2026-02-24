const config = require("config");
const Express = require("express");
const redirector = require("./redirector");
const Email = require("helper/email");
const { join } = require("path");
const cookieParser = require('cookie-parser');

const documentation = Express.Router();

const VIEW_DIRECTORY = config.views_directory;

// Handle CDN paths like /documentation/v-{hash}/documentation.min.css
documentation.get("/documentation/v-:hash/:file", async (req, res, next) => {
  // Extract the actual filename from the CDN path
  const actualPath = "/" + req.params.file;
  req.path = actualPath; // Override the path so buildOnDemand middleware can handle it
  next();
});

documentation.get(["/how/format/*", "/how/files/markdown", "/how/formatting/math"], function (req, res, next) {
  res.locals["show-on-this-page"] = true;
  next();
});

const files = [
  "/favicon-180x180.png",
  "/favicon-32x32.png",
  "/favicon-16x16.png",
  "/favicon.ico",
];

for (const path of files) {
  documentation.get(path, (req, res) =>
    res.sendFile(join(VIEW_DIRECTORY, path), {
      lastModified: false, // do not send Last-Modified header
      maxAge: "1y", // cache long-term
      acceptRanges: false, // do not allow ranged requests
      immutable: true, // the file will not change
    })
  );
}

// Build and serve CSS/JS in memory if minified files don't exist (for serverless where build might not run)
const buildOnDemand = async (req, res, next) => {
  try {
    const fs = require("fs-extra");
    const { join } = require("path");
    const CleanCSS = require("clean-css");
    const { build } = require("esbuild");
    const recursiveReadDir = require("helper/recursiveReadDirSync");
    const buildFinderCSS = require("./tools/finder/build");
    
    // Cache for built files (per request lifecycle)
    // The source views directory is always app/views (not views-built)
    // __dirname is /var/task/app/documentation, so ../../app/views gives us /var/task/app/views
    // Or we can use config.blot_directory + "/app/views" for consistency
    const viewsSource = join(config.blot_directory, "app/views");
    const filePath = join(VIEW_DIRECTORY, req.path);
    
    // Check if file exists first
    try {
      await fs.access(filePath);
      return next(); // File exists, let static middleware handle it
    } catch (e) {
      // File doesn't exist, build it in memory
    }
  
  // Build documentation.min.css (handle both direct and CDN paths like /documentation/v-{hash}/documentation.min.css)
  if (req.path === "/documentation.min.css" || req.path.endsWith("/documentation.min.css")) {
    try {
      console.log("Building documentation.min.css in memory for path:", req.path);
      const cssFilePaths = recursiveReadDir(viewsSource).filter(i => i.endsWith(".css"));
      const documentationFiles = cssFilePaths.filter(i => !i.includes("/dashboard/"));
      
      const cssContents = await Promise.all(
        documentationFiles.map(file => fs.readFile(file, "utf-8"))
      );
      const mergedCSS = cssContents.join("\n\n");
      const minifiedCSS = new CleanCSS({ level: 2 }).minify(mergedCSS);
      const finderCSS = await buildFinderCSS();
      const fullCSS = minifiedCSS.styles + "\n" + finderCSS;
      
      res.setHeader("Content-Type", "text/css");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.send(fullCSS);
    } catch (err) {
      console.error("Failed to build documentation.min.css:", err);
      console.error(err.stack);
      return next();
    }
  }
  
  // Build dashboard.min.css (handle both direct and CDN paths)
  if (req.path === "/dashboard.min.css" || req.path.endsWith("/dashboard.min.css")) {
    try {
      console.log("Building dashboard.min.css in memory for path:", req.path);
      const cssFilePaths = recursiveReadDir(viewsSource).filter(i => i.endsWith(".css"));
      const dashboardFiles = cssFilePaths.filter(i => i.includes("/dashboard/"));
      
      const cssContents = await Promise.all(
        dashboardFiles.map(file => fs.readFile(file, "utf-8"))
      );
      const mergedCSS = cssContents.join("\n\n");
      const minifiedCSS = new CleanCSS({ level: 2 }).minify(mergedCSS);
      
      res.setHeader("Content-Type", "text/css");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.send(minifiedCSS.styles);
    } catch (err) {
      console.error("Failed to build dashboard.min.css:", err);
      console.error(err.stack);
      return next();
    }
  }
  
  // Build documentation.min.js (handle both direct and CDN paths)
  if (req.path === "/documentation.min.js" || req.path.endsWith("/documentation.min.js")) {
    try {
      console.log("Building documentation.min.js in memory for path:", req.path);
      const result = await build({
        entryPoints: [join(viewsSource, "js/documentation.js")],
        bundle: true,
        minify: true,
        target: "es6",
        write: false, // Don't write to disk
      });
      
      res.setHeader("Content-Type", "application/javascript");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.send(result.outputFiles[0].text);
    } catch (err) {
      console.error("Failed to build documentation.min.js:", err);
      console.error(err.stack);
      return next();
    }
  }
  
  // Build dashboard.min.js (handle both direct and CDN paths)
  if (req.path === "/dashboard.min.js" || req.path.endsWith("/dashboard.min.js")) {
    try {
      console.log("Building dashboard.min.js in memory for path:", req.path);
      const result = await build({
        entryPoints: [join(viewsSource, "js/dashboard.js")],
        bundle: true,
        minify: true,
        target: "es6",
        write: false,
      });
      
      res.setHeader("Content-Type", "application/javascript");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.send(result.outputFiles[0].text);
    } catch (err) {
      console.error("Failed to build dashboard.min.js:", err);
      console.error(err.stack);
      return next();
    }
  }
  
  next();
  } catch (err) {
    // If there's any error in the middleware itself, log it and continue
    console.error("Error in buildOnDemand middleware:", err);
    return next(err);
  }
};

// Place buildOnDemand BEFORE static file serving so it can intercept requests
documentation.use(buildOnDemand);

// serve the VIEW_DIRECTORY as static files
documentation.use(
  Express.static(VIEW_DIRECTORY, {
    index: false, // Without 'index: false' this will server the index.html files inside
    redirect: false, // Without 'redirect: false' this will redirect URLs to existent directories
    maxAge: "1y", // cache long-term
    immutable: true,
  })
);

const directories = ["/fonts", "/css", "/images", "/js", "/videos"];

for (const path of directories) {
  documentation.use(
    path,
    Express.static(VIEW_DIRECTORY + path, {
      index: false, // Without 'index: false' this will server the index.html files inside
      redirect: false, // Without 'redirect: false' this will redirect URLs to existent directories
      maxAge: 86400000, // cache forever
    })
  );
}

documentation.use(require("./questions/related"));

documentation.get("/contact", (req, res, next) => {
  res.locals.fullWidth = true;
  next();
});

documentation.get(
  ["/about", "/how/configure", "/templates", "/questions"],
  (req, res, next) => {
    res.locals["hide-on-this-page"] = true;
    next();
  }
);

documentation.use(require("./selected"));

documentation.get("/", function (req, res, next) {
  res.locals.title = "Blot";
  res.locals.description = "Turns a folder into a website";
  // otherwise the <title> of the page is 'Blot - Blot'
  res.locals.hide_title_suffix = true;
  next();
});

// Inject the CSRF token into the form
documentation.get(['/support', '/contact', '/feedback'], require("dashboard/util/csrf"));

documentation.post(
  ["/support", "/contact", "/feedback"],
  require("dashboard/util/parse"),
  cookieParser(),
  require("dashboard/util/csrf"),
  (req, res) => {
    const { email, message, contact_e879, contact_7d45 } = req.body;

    // honeypot fields
    if (email || message) {
      return res.status(400).send("Invalid request");
    }

    if (!contact_e879) return res.status(400).send("Message is required");

    Email.SUPPORT(null, { email: contact_7d45, message: contact_e879, replyTo: contact_7d45 });
    res.send("OK");
  }
);

documentation.get("/examples", require("./featured"));

documentation.get("/templates", (req, res) => {
  res.render("templates/index");
});

documentation.get("/templates/for-:type", (req, res, next) => {
  res.locals.hidebreadcrumbs = true;
  const view = `templates/for-${req.params.type}/index`;
  res.render(view, (err, html) => {
    if (err) return next();
    res.send(html);
  });
});

documentation.get("/templates/:template", (req, res, next) => {
  res.locals.layout = "partials/layout-full-screen";
  const view = `templates/${req.params.template}/index`;
  res.render(view, (err, html) => {
    if (err) return next();
    res.send(html);
  });
});

documentation.use("/templates/fonts", require("./fonts"));

documentation.use("/developers", require("./developers"));

documentation.get("/sitemap.xml", require("./sitemap"));

documentation.use("/about", require("./about.js"));

documentation.use("/news", require("./news"));

documentation.use("/questions", require("./questions"));

function trimLeadingAndTrailingSlash(str) {
  if (!str) return str;
  if (str[0] === "/") str = str.slice(1);
  if (str[str.length - 1] === "/") str = str.slice(0, -1);
  return str;
}

documentation.use(function (req, res, next) {
  res.locals["show-main-section-right"] =
    (res.locals.selected && res.locals.selected.how === "selected") ||
    res.locals["show-toc"];
  res.locals["show-toc-or-on-this-page"] =
    res.locals["show-toc"] || res.locals["show-on-this-page"];
  next();
});

documentation.use(function (req, res, next) {
  const view = trimLeadingAndTrailingSlash(req.path) || "index";

  if (require("path").extname(view)) {
    return next();
  }

  res.render(view);
});

documentation.use((err, req, res, next) => {
  if (err && err.message.startsWith("Failed to lookup view")) return next();
  next(err);
});

// Will redirect old broken links
documentation.use(redirector);

// Missing page
documentation.use(function (req, res, next) {
  const err = new Error("Page not found");
  err.status = 404;
  next(err);
});

// Some kind of other error
// jshint unused:false
documentation.use(function (err, req, res, next) {
  res.locals.code = { error: true };

  if (config.environment === "development") {
    res.locals.error = { stack: err.stack };
  }

  res.locals.layout = "";
  res.status(err.status || 400);
  res.render("error");
});

module.exports = documentation;
