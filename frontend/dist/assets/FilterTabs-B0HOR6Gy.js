import{j as e}from"./index-B16jDRH3.js";const s=({software:a,selectedSoftwareId:t,onSelectFilter:o})=>e.jsx("div",{className:"mb-6 border-b border-gray-200",children:e.jsxs("div",{className:"flex flex-wrap items-center -mb-px",children:[e.jsx("button",{onClick:()=>o(null),className:`
            mr-4 py-3 px-4 text-sm font-medium border-b-2 transition-colors duration-150
            ${t===null?"border-blue-600 text-blue-600":"border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}
          `,children:"All"}),a.map(r=>e.jsx("button",{onClick:()=>o(r.id),className:`
              mr-4 py-3 px-4 text-sm font-medium border-b-2 transition-colors duration-150
              ${t===r.id?"border-blue-600 text-blue-600":"border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}
            `,children:r.name},r.id))]})});export{s as F};
