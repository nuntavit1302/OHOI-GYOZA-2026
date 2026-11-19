// js/hr-migrant.js
import { db } from "./firebase-config.js";
import { 
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, orderBy 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const employeesCol = collection(db, "employees");
let employeesData = [];

// คำนวณจำนวนวันที่เหลือจนถึงวันหมดอายุ
function getDaysRemaining(dateString) {
  if (!dateString) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expDate = new Date(dateString);
  const diffTime = expDate - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// สร้างป้ายสถานะสีตามจำนวนวันที่เหลือ
function formatExpiryBadge(dateString, label = "") {
  if (!dateString) return `<span class="text-slate-400 text-xs">- ไม่ระบุ -</span>`;
  
  const days = getDaysRemaining(dateString);
  let badgeClass = "bg-emerald-100 text-emerald-800 border-emerald-200";
  let statusText = `เหลือ ${days} วัน`;

  if (days < 0) {
    badgeClass = "bg-red-600 text-white border-red-700 font-bold animate-pulse";
    statusText = `หมดอายุแล้ว (${Math.abs(days)} วัน)`;
  } else if (days <= 15) {
    badgeClass = "bg-red-100 text-red-800 border-red-300 font-semibold";
    statusText = `ด่วน! เหลือ ${days} วัน`;
  } else if (days <= 60) {
    badgeClass = "bg-amber-100 text-amber-800 border-amber-300 font-medium";
    statusText = `ใกล้หมด (${days} วัน)`;
  }

  return `
    <div class="flex flex-col items-start gap-1">
      <span class="text-xs font-medium text-slate-700">${label ? label + ': ' : ''}${dateString}</span>
      <span class="text-[11px] px-2 py-0.5 rounded-full border ${badgeClass}">${statusText}</span>
    </div>
  `;
}

// โหลดข้อมูลพนักงานทั้งหมดจาก Firebase
async function loadEmployees() {
  const tbody = document.getElementById("employee-list");
  try {
    const q = query(employeesCol, orderBy("name"));
    const snapshot = await getDocs(q);
    employeesData = [];
    
    let countNormal = 0;
    let countWarning = 0;
    let countUrgent = 0;

    snapshot.forEach((docSnap) => {
      const data = { id: docSnap.id, ...docSnap.data() };
      employeesData.push(data);

      // นับสถิติการแจ้งเตือนเอกสาร (เฉพาะแรงงานต่างด้าว)
      if (data.nationality !== "TH") {
        const dates = [data.exp90Days, data.expWorkPermit, data.expVisa, data.expPassport];
        dates.forEach(d => {
          if (d) {
            const rem = getDaysRemaining(d);
            if (rem <= 15) countUrgent++;
            else if (rem <= 60) countWarning++;
            else countNormal++;
          }
        });
      }
    });

    // อัปเดตการ์ดสรุปด้านบน
    document.getElementById("stat-total").innerText = `${employeesData.length} คน`;
    document.getElementById("stat-normal").innerText = `${countNormal} รายการ`;
    document.getElementById("stat-warning").innerText = `${countWarning} รายการ`;
    document.getElementById("stat-urgent").innerText = `${countUrgent} รายการ`;

    renderTable();
  } catch (error) {
    console.error("Error loading employees:", error);
    tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-red-500">เกิดข้อผิดพลาดในการเชื่อมต่อ Firebase: ${error.message}</td></tr>`;
  }
}

// แสดงผลตาราง
function renderTable() {
  const tbody = document.getElementById("employee-list");
  if (employeesData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400">ยังไม่มีข้อมูลพนักงาน กดปุ่ม "+ เพิ่มพนักงาน" ด้านบนเพื่อเริ่มต้น</td></tr>`;
    return;
  }

  tbody.innerHTML = employeesData.map(emp => {
    const isThai = emp.nationality === "TH";
    const natBadge = isThai 
      ? `<span class="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded font-medium">🇹🇭 ไทย</span>`
      : `<span class="bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded font-medium">🇲🇲 ${emp.nationality}</span>`;

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="p-4">
          <div class="font-bold text-slate-800">${emp.name}</div>
          <div class="text-xs text-slate-500">${emp.role}</div>
          ${emp.driveLink ? `<a href="${emp.driveLink}" target="_blank" class="text-xs text-blue-600 underline mt-1 inline-block">📁 ดูไฟล์เอกสาร</a>` : ''}
        </td>
        <td class="p-4">
          ${natBadge}
          <div class="text-xs text-slate-600 mt-1">${Number(emp.wage).toLocaleString()} บ. (${emp.wageType})</div>
        </td>
        <td class="p-4">${isThai ? '-' : formatExpiryBadge(emp.exp90Days)}</td>
        <td class="p-4">${isThai ? '-' : formatExpiryBadge(emp.expWorkPermit)}</td>
        <td class="p-4 space-y-2">
          ${isThai ? '-' : `
            ${formatExpiryBadge(emp.expVisa, 'Visa')}
            ${formatExpiryBadge(emp.expPassport, 'PP')}
          `}
        </td>
        <td class="p-4">
          ${isThai ? '<span class="text-xs text-slate-400">พนักงานไทย</span>' : `<span class="text-xs font-medium text-slate-700">${emp.complianceStatus || '-'}</span>`}
        </td>
        <td class="p-4 text-center space-x-2">
          <button onclick="editEmployee('${emp.id}')" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1 rounded-lg text-xs font-medium">แก้ไข</button>
          <button onclick="deleteEmployee('${emp.id}', '${emp.name}')" class="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1 rounded-lg text-xs font-medium">ลบ</button>
        </td>
      </tr>
    `;
  }).join("");
}

// บันทึกข้อมูล (เพิ่มใหม่ หรือ อัปเดต)
document.getElementById("hr-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const id = document.getElementById("emp-id").value;
  const payload = {
    name: document.getElementById("emp-name").value.trim(),
    role: document.getElementById("emp-role").value,
    nationality: document.getElementById("emp-nationality").value,
    wageType: document.getElementById("emp-wage-type").value,
    wage: Number(document.getElementById("emp-wage").value),
    passportNo: document.getElementById("doc-passport-no").value.trim(),
    expPassport: document.getElementById("doc-passport-exp").value,
    expWorkPermit: document.getElementById("doc-wp-exp").value,
    expVisa: document.getElementById("doc-visa-exp").value,
    exp90Days: document.getElementById("doc-90days-exp").value,
    complianceStatus: document.getElementById("doc-compliance-status").value,
    driveLink: document.getElementById("doc-drive-link").value.trim(),
    updatedAt: new Date().toISOString()
  };

  try {
    if (id) {
      await updateDoc(doc(db, "employees", id), payload);
    } else {
      payload.createdAt = new Date().toISOString();
      await addDoc(employeesCol, payload);
    }
    closeModal();
    loadEmployees();
  } catch (error) {
    alert("บันทึกไม่สำเร็จ: " + error.message);
  }
});

// ฟังก์ชันเปิด/ปิด Modal และจัดการปุ่ม (ผูกกับ window เพื่อให้ HTML เรียกใช้ได้)
window.openModal = () => {
  document.getElementById("hr-form").reset();
  document.getElementById("emp-id").value = "";
  document.getElementById("modal-title").innerText = "เพิ่มข้อมูลพนักงานและเอกสาร";
  toggleMigrantFields();
  document.getElementById("hr-modal").classList.remove("hidden");
  document.getElementById("hr-modal").classList.add("flex");
};

window.closeModal = () => {
  document.getElementById("hr-modal").classList.add("hidden");
  document.getElementById("hr-modal").classList.remove("flex");
};

window.toggleMigrantFields = () => {
  const nat = document.getElementById("emp-nationality").value;
  const section = document.getElementById("migrant-section");
  section.style.display = (nat === "TH") ? "none" : "block";
};

window.editEmployee = (id) => {
  const emp = employeesData.find(item => item.id === id);
  if (!emp) return;

  document.getElementById("emp-id").value = emp.id;
  document.getElementById("emp-name").value = emp.name;
  document.getElementById("emp-role").value = emp.role;
  document.getElementById("emp-nationality").value = emp.nationality;
  document.getElementById("emp-wage-type").value = emp.wageType;
  document.getElementById("emp-wage").value = emp.wage;
  document.getElementById("doc-passport-no").value = emp.passportNo || "";
  document.getElementById("doc-passport-exp").value = emp.expPassport || "";
  document.getElementById("doc-wp-exp").value = emp.expWorkPermit || "";
  document.getElementById("doc-visa-exp").value = emp.expVisa || "";
  document.getElementById("doc-90days-exp").value = emp.exp90Days || "";
  document.getElementById("doc-compliance-status").value = emp.complianceStatus || "แจ้งเข้าทำงาน + ตม.30 เรียบร้อย";
  document.getElementById("doc-drive-link").value = emp.driveLink || "";

  document.getElementById("modal-title").innerText = "แก้ไขข้อมูล: " + emp.name;
  toggleMigrantFields();
  document.getElementById("hr-modal").classList.remove("hidden");
  document.getElementById("hr-modal").classList.add("flex");
};

window.deleteEmployee = async (id, name) => {
  if (confirm(`ยืนยันการลบข้อมูลพนักงาน "${name}" ใช่หรือไม่?`)) {
    try {
      await deleteDoc(doc(db, "employees", id));
      loadEmployees();
    } catch (error) {
      alert("ลบข้อมูลไม่สำเร็จ: " + error.message);
    }
  }
};

// เริ่มโหลดข้อมูลเมื่อเปิดหน้าเว็บ
loadEmployees();
