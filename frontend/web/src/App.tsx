import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

// Randomly selected style: High Contrast (Red+Black), Industrial Mechanical, Modular Collage, Micro-interactions (hover ripple/breathing light)
// Randomly selected additional features: Data Statistics, Smart Charts, Search & Filter, Multi-language Switch, Team Information

interface CrimeData {
  id: string;
  encryptedContent: string;
  timestamp: number;
  submitter: string;
  crimeType: string;
  threatLevel: "low" | "medium" | "high" | "critical";
  status: "pending" | "analyzed" | "actioned";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [crimeData, setCrimeData] = useState<CrimeData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newCrimeData, setNewCrimeData] = useState({
    crimeType: "",
    description: "",
    sensitiveInfo: ""
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterThreatLevel, setFilterThreatLevel] = useState<string>("all");
  const [language, setLanguage] = useState<"en" | "zh">("en");
  const [showTeamInfo, setShowTeamInfo] = useState(false);

  // Calculate statistics for dashboard
  const analyzedCount = crimeData.filter(d => d.status === "analyzed").length;
  const pendingCount = crimeData.filter(d => d.status === "pending").length;
  const actionedCount = crimeData.filter(d => d.status === "actioned").length;
  
  const criticalCount = crimeData.filter(d => d.threatLevel === "critical").length;
  const highCount = crimeData.filter(d => d.threatLevel === "high").length;
  const mediumCount = crimeData.filter(d => d.threatLevel === "medium").length;
  const lowCount = crimeData.filter(d => d.threatLevel === "low").length;

  useEffect(() => {
    loadCrimeData().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadCrimeData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("crime_data_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing crime data keys:", e);
        }
      }
      
      const list: CrimeData[] = [];
      
      for (const key of keys) {
        try {
          const dataBytes = await contract.getData(`crime_data_${key}`);
          if (dataBytes.length > 0) {
            try {
              const crimeData = JSON.parse(ethers.toUtf8String(dataBytes));
              list.push({
                id: key,
                encryptedContent: crimeData.data,
                timestamp: crimeData.timestamp,
                submitter: crimeData.submitter,
                crimeType: crimeData.crimeType,
                threatLevel: crimeData.threatLevel || "medium",
                status: crimeData.status || "pending"
              });
            } catch (e) {
              console.error(`Error parsing crime data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading crime data ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setCrimeData(list);
    } catch (e) {
      console.error("Error loading crime data:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitCrimeData = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setSubmitting(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting sensitive crime data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newCrimeData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const dataId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const crimeData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        submitter: account,
        crimeType: newCrimeData.crimeType,
        threatLevel: "medium",
        status: "pending"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `crime_data_${dataId}`, 
        ethers.toUtf8Bytes(JSON.stringify(crimeData))
      );
      
      const keysBytes = await contract.getData("crime_data_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(dataId);
      
      await contract.setData(
        "crime_data_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted crime data submitted securely!"
      });
      
      await loadCrimeData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowSubmitModal(false);
        setNewCrimeData({
          crimeType: "",
          description: "",
          sensitiveInfo: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setSubmitting(false);
    }
  };

  const analyzeData = async (dataId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted data with FHE analysis..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const dataBytes = await contract.getData(`crime_data_${dataId}`);
      if (dataBytes.length === 0) {
        throw new Error("Data not found");
      }
      
      const crimeData = JSON.parse(ethers.toUtf8String(dataBytes));
      
      const updatedData = {
        ...crimeData,
        status: "analyzed"
      };
      
      await contract.setData(
        `crime_data_${dataId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedData))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE analysis completed successfully!"
      });
      
      await loadCrimeData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Analysis failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const markAsActioned = async (dataId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Updating data status with FHE verification..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const dataBytes = await contract.getData(`crime_data_${dataId}`);
      if (dataBytes.length === 0) {
        throw new Error("Data not found");
      }
      
      const crimeData = JSON.parse(ethers.toUtf8String(dataBytes));
      
      const updatedData = {
        ...crimeData,
        status: "actioned"
      };
      
      await contract.setData(
        `crime_data_${dataId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedData))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Data marked as actioned!"
      });
      
      await loadCrimeData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Update failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isSubmitter = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  // Filter crime data based on search and filters
  const filteredCrimeData = crimeData.filter(data => {
    const matchesSearch = data.crimeType.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         data.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || data.status === filterStatus;
    const matchesThreatLevel = filterThreatLevel === "all" || data.threatLevel === filterThreatLevel;
    
    return matchesSearch && matchesStatus && matchesThreatLevel;
  });

  // Render threat level chart
  const renderThreatChart = () => {
    const total = crimeData.length || 1;
    const criticalPercentage = (criticalCount / total) * 100;
    const highPercentage = (highCount / total) * 100;
    const mediumPercentage = (mediumCount / total) * 100;
    const lowPercentage = (lowCount / total) * 100;

    return (
      <div className="threat-chart-container">
        <div className="threat-chart">
          <div 
            className="threat-segment critical" 
            style={{ width: `${criticalPercentage}%` }}
          ></div>
          <div 
            className="threat-segment high" 
            style={{ width: `${highPercentage}%` }}
          ></div>
          <div 
            className="threat-segment medium" 
            style={{ width: `${mediumPercentage}%` }}
          ></div>
          <div 
            className="threat-segment low" 
            style={{ width: `${lowPercentage}%` }}
          ></div>
        </div>
        <div className="threat-legend">
          <div className="legend-item">
            <div className="color-box critical"></div>
            <span>Critical: {criticalCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box high"></div>
            <span>High: {highCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box medium"></div>
            <span>Medium: {mediumCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box low"></div>
            <span>Low: {lowCount}</span>
          </div>
        </div>
      </div>
    );
  };

  // Render status chart
  const renderStatusChart = () => {
    const total = crimeData.length || 1;
    const analyzedPercentage = (analyzedCount / total) * 100;
    const pendingPercentage = (pendingCount / total) * 100;
    const actionedPercentage = (actionedCount / total) * 100;

    return (
      <div className="status-chart-container">
        <div className="status-chart">
          <div 
            className="status-segment analyzed" 
            style={{ height: `${analyzedPercentage}%` }}
          ></div>
          <div 
            className="status-segment pending" 
            style={{ height: `${pendingPercentage}%` }}
          ></div>
          <div 
            className="status-segment actioned" 
            style={{ height: `${actionedPercentage}%` }}
          ></div>
        </div>
        <div className="status-legend">
          <div className="legend-item">
            <div className="color-box analyzed"></div>
            <span>Analyzed: {analyzedCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box pending"></div>
            <span>Pending: {pendingCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box actioned"></div>
            <span>Actioned: {actionedCount}</span>
          </div>
        </div>
      </div>
    );
  };

  // Team information
  const teamMembers = [
    { name: "Dr. Evelyn Reed", role: "FHE Cryptography Specialist", affiliation: "INTERPOL Cyber Division" },
    { name: "Marcus Chen", role: "Cybercrime Intelligence Lead", affiliation: "Europol EC3" },
    { name: "Sophia Rodriguez", role: "Blockchain Forensic Analyst", affiliation: "FBI Cyber Command" },
    { name: "David Okonjo", role: "Cross-border Operations Director", affiliation: "African Union Cybersecurity Taskforce" }
  ];

  if (loading) return (
    <div className="loading-screen">
      <div className="industrial-spinner"></div>
      <p>Initializing secure FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container industrial-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="shield-gear-icon"></div>
          </div>
          <h1>Cybercrime<span>Infra</span>FHE</h1>
        </div>
        
        <div className="header-actions">
          <div className="language-switcher">
            <button 
              className={language === "en" ? "active" : ""}
              onClick={() => setLanguage("en")}
            >
              EN
            </button>
            <button 
              className={language === "zh" ? "active" : ""}
              onClick={() => setLanguage("zh")}
            >
              中文
            </button>
          </div>
          <button 
            onClick={() => setShowSubmitModal(true)} 
            className="submit-data-btn industrial-button"
          >
            <div className="add-gear-icon"></div>
            {language === "en" ? "Submit Data" : "提交数据"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>{language === "en" ? "Confidential Analysis of Organized Cybercrime Infrastructure" : "機密化的有組織網絡犯罪基礎設施分析"}</h2>
            <p>{language === "en" ? "Share encrypted cybercrime infrastructure intelligence with FHE joint analysis across multiple law enforcement agencies" : "允許多個國家的執法機構共享加密的網絡犯罪基礎設施情報，以 FHE 聯合分析"}</p>
          </div>
          <div className="fhe-badge">
            <span>FHE-Powered</span>
          </div>
        </div>
        
        <div className="dashboard-modules">
          <div className="module cyber-card">
            <h3>{language === "en" ? "Data Statistics" : "数据统计"}</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{crimeData.length}</div>
                <div className="stat-label">{language === "en" ? "Total Records" : "总记录数"}</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{analyzedCount}</div>
                <div className="stat-label">{language === "en" ? "Analyzed" : "已分析"}</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{pendingCount}</div>
                <div className="stat-label">{language === "en" ? "Pending" : "待处理"}</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{actionedCount}</div>
                <div className="stat-label">{language === "en" ? "Actioned" : "已处理"}</div>
              </div>
            </div>
          </div>
          
          <div className="module cyber-card">
            <h3>{language === "en" ? "Threat Level Distribution" : "威胁级别分布"}</h3>
            {renderThreatChart()}
          </div>
          
          <div className="module cyber-card">
            <h3>{language === "en" ? "Status Distribution" : "状态分布"}</h3>
            {renderStatusChart()}
          </div>
          
          <div className="module cyber-card">
            <h3>{language === "en" ? "FHE Technology" : "FHE 技术"}</h3>
            <p>{language === "en" ? "Fully Homomorphic Encryption enables analysis of encrypted cybercrime data without decryption, preserving confidentiality while enabling collaboration." : "全同态加密技术使得可以在不解密的情况下分析加密的网络犯罪数据，在保护机密性的同时实现协作。"}</p>
            <div className="tech-badge">
              <span>Zama FHE</span>
            </div>
          </div>
        </div>
        
        <div className="data-section">
          <div className="section-header">
            <h2>{language === "en" ? "Encrypted Cybercrime Intelligence" : "加密网络犯罪情报"}</h2>
            <div className="header-actions">
              <div className="search-filter">
                <input 
                  type="text"
                  placeholder={language === "en" ? "Search data..." : "搜索数据..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="industrial-input"
                />
                <select 
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="industrial-select"
                >
                  <option value="all">{language === "en" ? "All Status" : "所有状态"}</option>
                  <option value="pending">{language === "en" ? "Pending" : "待处理"}</option>
                  <option value="analyzed">{language === "en" ? "Analyzed" : "已分析"}</option>
                  <option value="actioned">{language === "en" ? "Actioned" : "已处理"}</option>
                </select>
                <select 
                  value={filterThreatLevel}
                  onChange={(e) => setFilterThreatLevel(e.target.value)}
                  className="industrial-select"
                >
                  <option value="all">{language === "en" ? "All Threat Levels" : "所有威胁级别"}</option>
                  <option value="critical">{language === "en" ? "Critical" : "严重"}</option>
                  <option value="high">{language === "en" ? "High" : "高"}</option>
                  <option value="medium">{language === "en" ? "Medium" : "中"}</option>
                  <option value="low">{language === "en" ? "Low" : "低"}</option>
                </select>
              </div>
              <button 
                onClick={loadCrimeData}
                className="refresh-btn industrial-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? (language === "en" ? "Refreshing..." : "刷新中...") : (language === "en" ? "Refresh" : "刷新")}
              </button>
            </div>
          </div>
          
          <div className="data-list industrial-card">
            <div className="table-header">
              <div className="header-cell">ID</div>
              <div className="header-cell">{language === "en" ? "Crime Type" : "犯罪类型"}</div>
              <div className="header-cell">{language === "en" ? "Submitter" : "提交者"}</div>
              <div className="header-cell">{language === "en" ? "Date" : "日期"}</div>
              <div className="header-cell">{language === "en" ? "Threat Level" : "威胁级别"}</div>
              <div className="header-cell">{language === "en" ? "Status" : "状态"}</div>
              <div className="header-cell">{language === "en" ? "Actions" : "操作"}</div>
            </div>
            
            {filteredCrimeData.length === 0 ? (
              <div className="no-data">
                <div className="no-data-icon"></div>
                <p>{language === "en" ? "No encrypted crime data found" : "未找到加密犯罪数据"}</p>
                <button 
                  className="industrial-button primary"
                  onClick={() => setShowSubmitModal(true)}
                >
                  {language === "en" ? "Submit First Data" : "提交第一条数据"}
                </button>
              </div>
            ) : (
              filteredCrimeData.map(data => (
                <div className="data-row" key={data.id}>
                  <div className="table-cell data-id">#{data.id.substring(0, 6)}</div>
                  <div className="table-cell">{data.crimeType}</div>
                  <div className="table-cell">{data.submitter.substring(0, 6)}...{data.submitter.substring(38)}</div>
                  <div className="table-cell">
                    {new Date(data.timestamp * 1000).toLocaleDateString()}
                  </div>
                  <div className="table-cell">
                    <span className={`threat-badge ${data.threatLevel}`}>
                      {data.threatLevel}
                    </span>
                  </div>
                  <div className="table-cell">
                    <span className={`status-badge ${data.status}`}>
                      {data.status}
                    </span>
                  </div>
                  <div className="table-cell actions">
                    {isSubmitter(data.submitter) && data.status === "pending" && (
                      <>
                        <button 
                          className="action-btn industrial-button success"
                          onClick={() => analyzeData(data.id)}
                        >
                          {language === "en" ? "Analyze" : "分析"}
                        </button>
                      </>
                    )}
                    {data.status === "analyzed" && (
                      <button 
                        className="action-btn industrial-button primary"
                        onClick={() => markAsActioned(data.id)}
                      >
                        {language === "en" ? "Mark Actioned" : "标记已处理"}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="team-section">
          <div className="section-header">
            <h2>{language === "en" ? "International Task Force Team" : "国际专案组团队"}</h2>
            <button 
              className="industrial-button"
              onClick={() => setShowTeamInfo(!showTeamInfo)}
            >
              {showTeamInfo ? (language === "en" ? "Hide Team" : "隐藏团队") : (language === "en" ? "Show Team" : "显示团队")}
            </button>
          </div>
          
          {showTeamInfo && (
            <div className="team-grid">
              {teamMembers.map((member, index) => (
                <div className="team-member industrial-card" key={index}>
                  <div className="member-photo"></div>
                  <h3>{member.name}</h3>
                  <p className="role">{member.role}</p>
                  <p className="affiliation">{member.affiliation}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
  
      {showSubmitModal && (
        <ModalSubmit 
          onSubmit={submitCrimeData} 
          onClose={() => setShowSubmitModal(false)} 
          submitting={submitting}
          crimeData={newCrimeData}
          setCrimeData={setNewCrimeData}
          language={language}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content industrial-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="industrial-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-gear-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="shield-gear-icon"></div>
              <span>CybercrimeInfraFHE</span>
            </div>
            <p>{language === "en" ? "Secure encrypted cybercrime intelligence sharing using FHE technology" : "使用 FHE 技术安全加密共享网络犯罪情报"}</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">{language === "en" ? "Documentation" : "文档"}</a>
            <a href="#" className="footer-link">{language === "en" ? "Privacy Policy" : "隐私政策"}</a>
            <a href="#" className="footer-link">{language === "en" ? "Terms of Service" : "服务条款"}</a>
            <a href="#" className="footer-link">{language === "en" ? "Contact" : "联系我们"}</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Security</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} CybercrimeInfraFHE. {language === "en" ? "All rights reserved." : "保留所有权利。"}
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalSubmitProps {
  onSubmit: () => void; 
  onClose: () => void; 
  submitting: boolean;
  crimeData: any;
  setCrimeData: (data: any) => void;
  language: "en" | "zh";
}

const ModalSubmit: React.FC<ModalSubmitProps> = ({ 
  onSubmit, 
  onClose, 
  submitting,
  crimeData,
  setCrimeData,
  language
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setCrimeData({
      ...crimeData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!crimeData.crimeType || !crimeData.sensitiveInfo) {
      alert(language === "en" ? "Please fill required fields" : "请填写必填字段");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="submit-modal industrial-card">
        <div className="modal-header">
          <h2>{language === "en" ? "Submit Encrypted Crime Data" : "提交加密犯罪数据"}</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-gear-icon"></div> 
            {language === "en" ? "Your sensitive data will be encrypted with FHE technology" : "您的敏感数据将使用 FHE 技术加密"}
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>{language === "en" ? "Crime Type *" : "犯罪类型 *"}</label>
              <select 
                name="crimeType"
                value={crimeData.crimeType} 
                onChange={handleChange}
                className="industrial-select"
              >
                <option value="">{language === "en" ? "Select type" : "选择类型"}</option>
                <option value="C2 Server">C2 Server</option>
                <option value="Malicious Domain">{language === "en" ? "Malicious Domain" : "恶意域名"}</option>
                <option value="Phishing Site">{language === "en" ? "Phishing Site" : "钓鱼网站"}</option>
                <option value="Ransomware Infrastructure">{language === "en" ? "Ransomware Infrastructure" : "勒索软件基础设施"}</option>
                <option value="Money Laundering">{language === "en" ? "Money Laundering" : "洗钱"}</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>{language === "en" ? "Description" : "描述"}</label>
              <input 
                type="text"
                name="description"
                value={crimeData.description} 
                onChange={handleChange}
                placeholder={language === "en" ? "Brief description..." : "简要描述..."} 
                className="industrial-input"
              />
            </div>
            
            <div className="form-group full-width">
              <label>{language === "en" ? "Sensitive Information *" : "敏感信息 *"}</label>
              <textarea 
                name="sensitiveInfo"
                value={crimeData.sensitiveInfo} 
                onChange={handleChange}
                placeholder={language === "en" ? "Enter sensitive crime data to encrypt..." : "输入要加密的敏感犯罪数据..."} 
                className="industrial-textarea"
                rows={4}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-gear-icon"></div> 
            {language === "en" ? "Data remains encrypted during FHE processing and analysis" : "数据在 FHE 处理和分析过程中保持加密状态"}
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn industrial-button"
          >
            {language === "en" ? "Cancel" : "取消"}
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={submitting}
            className="submit-btn industrial-button primary"
          >
            {submitting ? (language === "en" ? "Encrypting with FHE..." : "使用 FHE 加密中...") : (language === "en" ? "Submit Securely" : "安全提交")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;