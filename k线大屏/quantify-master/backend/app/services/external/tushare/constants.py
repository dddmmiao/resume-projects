# Centralized field constants for Tushare requests and DAO upserts

# ths_index fields
THS_INDEX_FIELDS = "ts_code,name,count,exchange,list_date,type"

# ths_daily fields
THS_DAILY_FIELDS = (
    "ts_code,trade_date,open,high,low,close,pre_close,change,pct_change,vol,turnover_rate,total_mv,float_mv,avg_price"
)

# ths_hot fields
THS_HOT_FIELDS = "ts_code,ts_name,hot,rank,trade_date,rank_time,concept,rank_reason"

# cb_daily fields
CB_DAILY_FIELDS = (
    "ts_code,trade_date,pre_close,open,high,low,close,change,pct_chg,vol,amount,bond_value,bond_over_rate,cb_value,cb_over_rate"
)

# stock_basic common fields
STOCK_BASIC_FIELDS = "ts_code,symbol,name,area,industry,market,list_date,is_hs"

# cb_call fields
CB_CALL_FIELDS = (
    "ts_code,call_type,is_call,ann_date,call_date,call_price,call_price_tax,call_vol,call_amount,payment_date,call_reg_date"
)

# weekly/monthly fields (align with daily core OHLCV set where supported)
WEEKLY_FIELDS = "ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount"
MONTHLY_FIELDS = WEEKLY_FIELDS

# cb_basic fields
CB_BASIC_FIELDS = (
    "ts_code,bond_short_name,stk_code,stk_short_name,list_date,delist_date,issue_date,maturity_date,"
    "issue_size,remain_size,conv_start_date,conv_end_date,first_conv_price,conv_price,list_status"
)

# stk_auction fields (开盘竞价)
STK_AUCTION_FIELDS = "ts_code,trade_date,vol,price,amount,pre_close,turnover_rate,volume_ratio,float_share"

# daily_basic fields (每日指标)
DAILY_BASIC_FIELDS = (
    "ts_code,trade_date,close,turnover_rate,turnover_rate_f,volume_ratio,"
    "pe,pe_ttm,pb,ps,ps_ttm,dv_ratio,dv_ttm,"
    "total_share,float_share,free_share,total_mv,circ_mv"
)
