import React, { useRef } from 'react';
import html2pdf from 'html2pdf.js';
import { Download } from 'lucide-react';

const LoanApplicationForm: React.FC = () => {
  const formRef = useRef<HTMLDivElement>(null);

  const handleDownloadPDF = () => {
    const element = formRef.current;
    if (!element) return;

    const opt = {
      margin:       10,
      filename:     'Giay_De_Nghi_Vay_Von.pdf',
      image:        { type: 'jpeg' as const, quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
    };

    html2pdf().set(opt).from(element).save();
  };

  return (
    <div className="flex flex-col items-center p-8 bg-gray-50 min-h-screen">
      <div className="w-full max-w-[850px] mb-6 flex justify-end">
        <button 
          onClick={handleDownloadPDF}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow transition-colors"
        >
          <Download size={18} />
          <span>Tải xuống PDF (Dành cho Chuyên viên)</span>
        </button>
      </div>

      <div 
        ref={formRef} 
        className="w-full max-w-[850px] bg-white p-12 shadow-lg text-sm text-black font-serif"
        style={{ minHeight: '1122px' }}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div className="font-bold text-green-700 text-2xl tracking-tighter">
            Vietcombank
          </div>
          <div className="text-right text-green-700 text-xs">
            Mẫu NHBL01.TIEUDUNG.DNVV
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-xl font-bold mb-2">GIẤY ĐỀ NGHỊ VAY VỐN KIÊM PHƯƠNG ÁN TRẢ NỢ</h1>
          <p className="italic text-gray-700 text-sm">Áp dụng cho Sản phẩm cho vay tiêu dùng không bảo đảm tài sản đối với khách hàng cá nhân</p>
          <div className="mt-4 flex justify-between px-10">
            <span>Số:...........................</span>
            <span className="italic">Ngày... tháng... năm...</span>
            <span className="font-bold">Trang 1/3</span>
          </div>
          <hr className="border-t-2 border-black mt-2 mb-6" />
        </div>

        <div className="mb-6 text-center text-lg">
          <span className="font-bold underline">Kính gửi:</span> <span className="font-bold">NGÂN HÀNG TMCP NGOẠI THƯƠNG VIỆT NAM - Chi nhánh</span>
        </div>

        {/* I. THÔNG TIN CHUNG */}
        <div className="mb-6">
          <h2 className="font-bold text-base mb-3 uppercase">I. THÔNG TIN CHUNG</h2>
          
          <h3 className="font-bold mb-2">1. Thông tin Khách hàng</h3>
          <div className="grid grid-cols-12 gap-y-2 gap-x-4 mb-4">
            <div className="col-span-8 flex"><span className="mr-2">Tên khách hàng:</span><div className="border-b border-dotted border-gray-400 flex-grow"></div></div>
            <div className="col-span-4 flex"><span className="mr-2">Ngày sinh:</span><div className="border-b border-dotted border-gray-400 flex-grow">/ /</div></div>
            
            <div className="col-span-8 flex"><span className="mr-2">Giấy CMND/Hộ chiếu số:</span><div className="border-b border-dotted border-gray-400 flex-grow"></div></div>
            <div className="col-span-4 flex"><span className="mr-2">Ngày cấp:</span><div className="border-b border-dotted border-gray-400 flex-grow"></div></div>
            
            <div className="col-span-12 flex"><span className="mr-2">Hộ khẩu thường trú:</span><div className="border-b border-dotted border-gray-400 flex-grow"></div></div>
            <div className="col-span-12 flex"><span className="mr-2">Nơi ở hiện tại (nếu khác Hộ khẩu thường trú):</span><div className="border-b border-dotted border-gray-400 flex-grow"></div></div>
            
            <div className="col-span-4 flex"><span className="mr-2">Điện thoại nhà:</span><div className="border-b border-dotted border-gray-400 flex-grow"></div></div>
            <div className="col-span-4 flex"><span className="mr-2">Điện thoại cơ quan:</span><div className="border-b border-dotted border-gray-400 flex-grow"></div></div>
            <div className="col-span-4 flex"><span className="mr-2">Di động:</span><div className="border-b border-dotted border-gray-400 flex-grow"></div></div>
            
            <div className="col-span-12 flex"><span className="mr-2">Email:</span><div className="border-b border-dotted border-gray-400 flex-grow"></div></div>
          </div>

          <h3 className="font-bold mb-2 mt-4">2. Thông tin vợ/chồng của Khách hàng</h3>
          <div className="grid grid-cols-12 gap-y-2 gap-x-4 mb-4">
             <div className="col-span-8 flex"><span className="mr-2">Họ tên:</span><div className="border-b border-dotted border-gray-400 flex-grow"></div></div>
             <div className="col-span-4 flex"><span className="mr-2">Ngày sinh:</span><div className="border-b border-dotted border-gray-400 flex-grow">/ /</div></div>
          </div>
        </div>

        {/* II. THÔNG TIN VỀ NGHỀ NGHIỆP VÀ TÀI CHÍNH */}
        <div className="mb-6">
          <h2 className="font-bold text-base mb-3 uppercase">II. THÔNG TIN VỀ NGHỀ NGHIỆP VÀ TÀI CHÍNH</h2>
          
          <h3 className="font-bold mb-2">1. Nghề nghiệp</h3>
          <div className="grid grid-cols-12 gap-y-2 gap-x-4 mb-4">
            <div className="col-span-12 flex"><span className="mr-2">Tên đơn vị công tác/đơn vị quản lý:</span><div className="border-b border-dotted border-gray-400 flex-grow"></div></div>
            <div className="col-span-12 flex"><span className="mr-2">Địa chỉ nơi công tác:</span><div className="border-b border-dotted border-gray-400 flex-grow"></div></div>
          </div>

          <h3 className="font-bold mb-2 mt-4">2. Thu nhập</h3>
          <table className="w-full border-collapse border border-black mb-4 text-left">
            <tbody>
              <tr>
                <td className="border border-black p-2 font-bold w-3/4">Tổng thu nhập hàng tháng</td>
                <td className="border border-black p-2 italic text-right">đồng</td>
              </tr>
              <tr>
                <td className="border border-black p-2 pl-4">- Lương hàng tháng (sau khi đã trừ thuế)</td>
                <td className="border border-black p-2 italic text-right">đồng</td>
              </tr>
              <tr>
                <td className="border border-black p-2 font-bold">Tổng chi phí hàng tháng của khách hàng</td>
                <td className="border border-black p-2 italic text-right">đồng</td>
              </tr>
              <tr>
                <td className="border border-black p-2 font-bold bg-gray-100">Thu nhập ròng hàng tháng (Thu nhập - Chi phí)</td>
                <td className="border border-black p-2 font-bold italic text-right bg-gray-100">đồng</td>
              </tr>
            </tbody>
          </table>

          <h3 className="font-bold mb-2 mt-4">3. Lịch sử giao dịch tín dụng</h3>
          <table className="w-full border-collapse border border-black mb-4 text-center">
            <thead>
              <tr className="bg-gray-100 font-bold">
                <th className="border border-black p-2">STT</th>
                <th className="border border-black p-2">Tên tổ chức tín dụng</th>
                <th className="border border-black p-2">Hạn mức vay</th>
                <th className="border border-black p-2">Dư nợ hiện tại</th>
                <th className="border border-black p-2">Hình thức bảo đảm</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-black p-2 h-8">1</td>
                <td className="border border-black p-2"></td>
                <td className="border border-black p-2"></td>
                <td className="border border-black p-2"></td>
                <td className="border border-black p-2 text-left text-xs"><input type="checkbox" className="mr-1"/>Không có TSBĐ<br/><input type="checkbox" className="mr-1"/>Bảo đảm bằng TS</td>
              </tr>
              <tr>
                <td className="border border-black p-2 h-8">2</td>
                <td className="border border-black p-2"></td>
                <td className="border border-black p-2"></td>
                <td className="border border-black p-2"></td>
                <td className="border border-black p-2 text-left text-xs"><input type="checkbox" className="mr-1"/>Không có TSBĐ<br/><input type="checkbox" className="mr-1"/>Bảo đảm bằng TS</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* III. KHOẢN VAY ĐỀ NGHỊ */}
        <div className="mb-6">
          <h2 className="font-bold text-base mb-3 uppercase">III. KHOẢN VAY ĐỀ NGHỊ</h2>
          <div className="space-y-2">
             <div className="flex"><span className="mr-2">- Mục đích vay vốn:</span><span className="font-bold border-b border-dotted border-gray-400 flex-grow">Tiêu dùng hợp pháp phục vụ đời sống cá nhân và gia đình.</span></div>
             <div className="flex"><span className="mr-2">- Số tiền vay (ghi cụ thể):</span><div className="border-b border-dotted border-gray-400 flex-grow"></div></div>
             <div className="flex"><span className="mr-2">- Thời hạn vay:</span><div className="border-b border-dotted border-gray-400 flex-grow w-16"></div> <span className="ml-2">tháng.</span></div>
          </div>
        </div>

        {/* IV. CAM KẾT */}
        <div className="mb-12">
          <h2 className="font-bold text-base mb-3 uppercase">IV. CAM KẾT CỦA NGƯỜI ĐỀ NGHỊ VAY VỐN</h2>
          <ul className="list-decimal pl-5 space-y-1">
            <li>Hiện tại không có dư nợ quá hạn tại các Tổ chức tín dụng.</li>
            <li>Sử dụng vốn vay đúng mục đích đã nêu trong đơn đề nghị này và hoàn trả nợ đầy đủ, đúng hạn.</li>
            <li>Những thông tin nêu tại Giấy đề nghị vay vốn kiêm phương án trả nợ này là hoàn toàn đúng sự thật.</li>
          </ul>
        </div>

        {/* Signatures */}
        <div className="flex justify-end pr-12 pb-20">
           <div className="text-center">
              <div className="italic mb-2">Ngày ..... tháng ..... năm .....</div>
              <div className="font-bold mb-16">Người đề nghị</div>
              <div className="italic">(ký và ghi rõ họ tên)</div>
           </div>
        </div>

      </div>
    </div>
  );
};

export default LoanApplicationForm;
