-- 1. Hàm cộng/trừ xu an toàn với khóa dòng ví
CREATE OR REPLACE FUNCTION public.charge_user_coin(
    p_user_id UUID,
    p_amount BIGINT,
    p_order_id UUID,
    p_type VARCHAR(50),
    p_description TEXT
) RETURNS VOID AS $$
DECLARE
    v_wallet_id UUID;
    v_current_balance BIGINT;
BEGIN
    -- Tạo ví mặc định nếu chưa tồn tại
    INSERT INTO public.wallets (user_id, balance, updated_at)
    VALUES (p_user_id, 0, now())
    ON CONFLICT (user_id) DO NOTHING;

    -- Khóa dòng ví (Row-level Lock) và lấy số dư
    SELECT id, balance INTO v_wallet_id, v_current_balance
    FROM public.wallets
    WHERE user_id = p_user_id
    FOR UPDATE;

    -- Kiểm tra nếu số dư không đủ (khi trừ xu)
    IF p_amount < 0 AND v_current_balance + p_amount < 0 THEN
        RAISE EXCEPTION 'Số dư ví không đủ để thực hiện giao dịch này';
    END IF;

    -- Cập nhật số dư ví mới
    UPDATE public.wallets
    SET balance = balance + p_amount,
        updated_at = now()
    WHERE id = v_wallet_id;

    -- Ghi sổ nhật ký giao dịch
    INSERT INTO public.coin_transactions (wallet_id, order_id, amount, type, description, created_at)
    VALUES (v_wallet_id, p_order_id, p_amount, p_type, p_description, now());

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Hàm hoàn tất hóa đơn nạp xu an toàn (Chống xử lý trùng lặp và Race Condition)
CREATE OR REPLACE FUNCTION public.complete_payment_order(
    p_order_id UUID,
    p_provider_tx_id VARCHAR(255)
) RETURNS BOOLEAN AS $$
DECLARE
    v_order_status VARCHAR(50);
    v_user_id UUID;
    v_coin_amount BIGINT;
    v_provider VARCHAR(50);
BEGIN
    -- Khóa dòng đơn hàng để tránh xử lý đồng thời từ 2 webhook trùng lặp
    SELECT status, user_id, coin_amount, provider INTO v_order_status, v_user_id, v_coin_amount, v_provider
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    -- Kiểm tra nếu đơn hàng không ở trạng thái PENDING thì dừng xử lý
    IF v_order_status != 'PENDING' THEN
        RETURN FALSE;
    END IF;

    -- Cập nhật trạng thái đơn hàng thành công và mã giao dịch cổng thanh toán
    UPDATE public.orders
    SET status = 'SUCCESS',
        provider_tx_id = p_provider_tx_id
    WHERE id = p_order_id;

    -- Gọi hàm cộng xu an toàn
    PERFORM public.charge_user_coin(
        v_user_id,
        v_coin_amount,
        p_order_id,
        'RECHARGE',
        'Nạp xu tự động qua ' || v_provider
    );

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
