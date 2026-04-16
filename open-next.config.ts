// This is a configuration file for Cloudflare Pages deployment 

module.exports = {  
  build: {   
    command: "npm run build",  
    outputs: ["dist/**/*"],  
  },  
  functions: {   
    directory: "./functions"  
  },  
  routes: [   
    {   
      src: "/(.*)",   
      dest: "/index.html",   
      headers: {   
        "Cache-Control": "no-cache"   
      }   
    }   
  ]  
};